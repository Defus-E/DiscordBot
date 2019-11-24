const config = require('./config');
const discord = require('discord.js');
const query = require('./libs/mysql');
const Client = require('./models/client');
const Key = require('./models/key');
const prefix = config.get('general:prefix');

const bot = new discord.Client();

let timeout;
let clients = []; // Массив, в котором находятся пользователи с таймером

// Сработает, когда бот активируется
bot.on('ready', async () => {
	try {
		const guild = await bot.guilds.find(guild => guild); // Найти группу
		const role = await guild.roles.find(role => role.name === "Client"); // Проверить существование роли "Клиент"

		// Если роль не существует - создать
		if (!role) {
			guild.createRole({
				name: 'Client',
				color: '1cff3d',
				mentionable: false,
				permissions: [
					'CHANGE_NICKNAME',
					'ATTACH_FILES',
					'EMBED_LINKS',
					'USE_EXTERNAL_EMOJIS',
					'READ_MESSAGE_HISTORY',
					'SEND_MESSAGES',
					'SEND_TTS_MESSAGES'
				]
			});
		}

		// Заполнить массив clients пользователеми из базы
		clients = await query("SELECT * FROM clients WHERE paid = 0 AND balance IS NULL");

		// Установить таймер в 1 минуту
		setInterval(() => {
			for(let i = 0; i < clients.length; i++) {
				// Получить разницу(в днях) между текущим временем и временем дедлайна
				const now = new Date();
				const time = clients[i].time;
				const distance = time - now;
				const day = Math.ceil(distance / 86400000);

				const memb = guild.members.find(m => m.kickable && !m.user.bot && m.id == clients[i].id);

				memb.setNickname(`${clients[i].name} - [${day}д]`); // Выводить в ник остаток дней у клиента
					
				// Если интервал меньше нуля(срок истёк)
				if (distance < 0) {
					const index = clients.findIndex(elem => elem.id === memb.id);
			
					memb.removeRole(role);
					memb.send('Ваш срок истёк!');

					query("DELETE FROM ukeys WHERE id = ?", [clients[index].id]);
					clients.splice(index, 1);
				}
				
			}
		}, 1000 * 60);

		console.log('\x1b[33m', 'Bot is ready!', '\x1b[0m');
	} catch (error) {
		console.error(error);
	}
});

// Сработает, когда пользователь покинет чат
bot.on('guildMemberRemove', async member => {
	try {
		const { id } = member.user;
		const index = clients.findIndex(elem => elem.id === id);
		
		await clients.splice(index, 1);
		await query("DELETE FROM ukeys WHERE id = ?", [id]);
		await query("DELETE FROM clients WHERE id = ?", [id]);
	} catch (error) {
		console.error(error);
	}
});

// Срабатывает, когда администратор выдает команды боту
bot.on('message', async msg => {
	try {
		if (msg.author.bot || msg.channel.type === 'dm' || !msg.member.hasPermission('ADMINISTRATOR')) return;

		// Найти главную и вспомогательные команды
		const content = msg.content.split(' ');
		const command = content[0];
		const args = content.slice(1).filter(arg => arg !== null && arg !== '' && arg !== undefined);

		if (!command.startsWith(prefix)) return; // Команда должна начинатся с определённого символа

		// Добавить тайм
		if (command === `${prefix}addTime`) {
			// Найти клиента, нужную роль и количество дней
			const client = await msg.guild.member(msg.mentions.users.first()) || msg.guild.members.get(args[0]);
			const role = await msg.guild.roles.find(role => role.name === "Client");
			const days = parseInt(args[1]);

			// Проверка на соблюдения всех правил требования
			if (!client) return msg.channel.send('Пользователь не найден');
			if (client.id === msg.author.id) return msg.channel.send('К сожалению, вы не можете выдать срок самому себе!');
			if (isNaN(days) || days < 0) return msg.channel.send('Третий параметр должен быть целым положительным числом!');
			
			// Получение информации о пользователе и занесения его в базу и массив проверок
			const { id, username } = client.user;
			const index = clients.findIndex(elem => elem.id == id);
			const key = await Key.takeKey(id);
			const cl = await Client.addTime(id, username, days, key);

			if (key && cl) client.send(`Здравствуйте, спасибо за преобретение. Ваш ключ - ${key.ukey}.\n ${config.get('general:message')}`);
			if (cl && clients[index]) {
				clients[index].time = cl.time; 
				client.setNickname(`${cl.name} - [${cl.days}д]`);
			} else if (cl && key) {
				clients.push(cl);
				client.setNickname(`${cl.name} - [${cl.days}д]`);
			} else {
				return msg.channel.send(`К сожалению, у пользователя "${username}" остановлен срок, либо свободных ключей в базе не найдено.`);
			}

			await msg.channel.send(`Добавлен срок пользователю "${username}" + ${days}д`);
			await client.addRole(role);

			return;
		}

		// Убрать тайм
		if (command === `${prefix}removeTime`)  {
			// Найти клиента и нужную роль
			const client = await msg.guild.member(msg.mentions.users.first()) || msg.guild.members.get(args[0]);
			const role = await msg.guild.roles.find(role => role.name === "Client");
			
			// Проверка на соблюдения всех правил требования
			if (!client) return msg.channel.send('Пользователь не найден');
			if (client.id === msg.author.id) return;

			// Получение информации о пользователе и удаления из массива проверок
			const { id, username } = client.user;
			const index = clients.findIndex(elem => elem.id == id);
			const cl = await Client.removeTime(id);

			if (!cl) return msg.channel.send(`У пользователя ${username} нет срока!`);
			if (timeout) clearTimeout(timeout);

			client.removeRole(role);
			client.setNickname(cl.name);
			clients.splice(index, 1);

			query("DELETE FROM ukeys WHERE id = ? LIMIT 1", [id]);

			return msg.channel.send(`Срок снят с пользователя ${cl.name}.`);
		}

		// Остановить тайм
		if (command === `${prefix}stopTime`) {
			const client = await msg.guild.member(msg.mentions.users.first()) || msg.guild.members.get(args[0]); // Получить пользоватля
			
			// Проверка на соблюдения всех правил требования
			if (!client) return msg.channel.send('Пользователь не найден');
			if (client.id === msg.author.id) return;

			// Получение информации о пользователе
			const { id, username } = client.user;
			const {cl, days} = await Client.stopTime(id);
			const index = clients.findIndex(elem => elem.id == id);

			// Проверка на сущ. тайма у пользователя
			if (!cl) return msg.channel.send(`У пользователя ${username} нет срока!`);
			if (cl.balance && !cl.paid && days) {
				client.setNickname(`${cl.name} [${days} ост.]`); // Установить дефолтный никнейм
				clients.splice(index, 1); // Удалить пользователя из массива
				msg.channel.send(`Остановлен срок для пользователя ${cl.name}.`); // Отправить message всем	
			} else {
				client.setNickname(`${cl.name} - [${days}д]`); // Установить дефолтный никнейм
				clients.push(cl); // Добавить в массив проверок клиента обратно
				msg.channel.send(`Возобновлён срок для пользователя ${cl.name} - ${days}д`); // Отправить message всем
			}

			return;
		}

		// Добавить ключ в базу
		if (command === `${prefix}addKey`) {
			try {
				const key = args[0];
				const res = await Key.addKey(key);

				if (res) msg.channel.send('Ключ добавлен.');	
			} catch (error) {
				msg.channel.send('Ошибка. Ключ должен быть уникальным! Пожалуйста, проверьте входные данные.');
			}

			return msg.delete(500);
		}

		// Кикнуть пользователя
		if (command === `${prefix}kick`) {
			const toKick = msg.guild.member(msg.mentions.users.first()) || msg.guild.members.get(args[0]); // Получить пользоватля
			const reason = args.slice(1).join(" "); // Причина кика

			// Проверка прав
			if (!msg.member.hasPermission('KICK_MEMBERS')) return;
			if (!toKick) return msg.channel.send('Пользователь не найден');
			if (toKick.id === msg.author.id) return msg.channel.send('Вы не можете кикнуть самого себя');

			// Удаление из чата
			msg.channel.send(`Пользователь ${toKick} изгнан.`);
			await toKick.send(`Вы были кикнуты с сервера "${msg.guild.name}", по причине: \n ${reason}`);
			await msg.guild.member(toKick).kick(reason);

			return;
		}

		// Забанить пользователя
		if (command === `${prefix}ban`) {
			const toBan = msg.guild.member(msg.mentions.users.first()) || msg.guild.members.get(args[0]); // Получить пользоватля
			const reason = args.slice(1).join(" "); // Причина бана

			// Проверка прав
			if (!msg.member.hasPermission('BAN_MEMBERS')) return;
			if (!toBan) return msg.channel.send('Пользователь не найден');
			if (toBan.id === msg.author.id) return msg.channel.send('Вы не можете забанить самого себя');

			// Забанить клиента
			msg.channel.send(`Пользователь ${toBan} изгнан.`);
			await toBan.send(`Вы были забанены на сервере "${msg.guild.name}", по причине: \n ${reason}`);
			await msg.guild.member(toBan).ban(reason);

			return;
		}
	} catch (error) {
		msg.author.send(error);
	}
});

bot.login(config.get('general:token'));