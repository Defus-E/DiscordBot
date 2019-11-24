const query = require('../libs/mysql');
const select_q = "SELECT * FROM clients WHERE id = ? LIMIT 1";

// Увеличить срок
const addDate = (days, time) => {
	let date = time ? new Date(time) : new Date();
	date.setDate(date.getDate() + days);
  	return date;
}

class Client {
	// Добавить время пользователю
	static async addTime(id, username, days, key) {
		try {
			const update_q = "UPDATE clients SET paid = 0, days = days + ?, time = ? WHERE id = ?";
			const client = await query(select_q, [id]);
			
			// Если клиента не существует - создать
			if ((!client[0] && !key ) || (client[0] && client[0].balance)) return false;
			if (!client[0] && key) {
				const insert_q = "INSERT INTO clients (id, name, days, time) VALUES (?, ?, ?, ?)";
				await query(insert_q, [id, username, days, addDate(days)]);
				const res = await query(select_q, [id]);

				return res[0];
			}
	
			const time = client[0].time ? addDate(days, client[0].time) : addDate(days);
			
			await query(update_q, [days, time, id]);
			const res = await query(select_q, [id]);

			return res[0];
		} catch (error) {
			throw error;
		}
	}

	// Удалить время у пользователя
	static async removeTime(id) {
		try {
			const update_q = "UPDATE clients SET paid = 1, days = 0, balance = NULL, time = NULL WHERE id = ?";
			const client = await query(select_q, [id]);

			if (!client[0] || (client[0].time === null && !client[0].balance)) return false;
			
			await query(update_q, [id]);
			const res = await query(select_q, [id]);
			return res[0];
		} catch (error) {
			throw error;
		}
	}

	// Остановить время у пользователя 
	static async stopTime(id) {
		try {
			const clients_arr = await query(select_q, [id]);
			const client = clients_arr[0];
			const now = new Date();

			let days;

			if (!client || (client.time === null && client.paid)) return false; // Если Пользователь не найден или тайма нет - вернуться

			// Проверить - существует ли  уже остаток дней у пользователя
			if (!client.balance) {
				const time = client.time;
				const distance = time - now;
				days = Math.ceil(distance / 86400000);

				query("UPDATE clients SET balance = ?, time = NULL WHERE id = ?", [days, id]);
			} else {
				days = client.balance;
				query("UPDATE clients SET balance = NULL, time = ? WHERE id = ?", [addDate(days, now), id]);
			}

			const cl = await query(select_q, [id]);
			return {cl: cl[0], days};
		} catch (error) {
			throw error;
		}
	}
}

module.exports = Client;