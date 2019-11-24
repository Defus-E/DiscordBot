const query = require('../libs/mysql');

class Key {
	// Добавить ключ в базу
	static async takeKey(id) {
		try {
			const exist_q = "SELECT * FROM ukeys WHERE id = ? LIMIT 1";
			const select_q = "SELECT * FROM ukeys WHERE uses = 0 OR uses IS NULL LIMIT 1";
			const update_q = "UPDATE ukeys SET id = ?, uses = 1 WHERE uses = 0 OR uses IS NULL LIMIT 1";
			const existsKey = await query(exist_q, [id]);
			const keys = await query(select_q);

			if (existsKey.length !== 0 || keys.length === 0) return false;

			await query(update_q, [id]);
			const key = await query("SELECT * FROM ukeys WHERE id = ? LIMIT 1", [id]);

			return key[0];
		} catch (error) {
			throw error;
		}
	}

	// Добавить ключ в базу
	static async addKey(key) {
		try {
			// UKey - Unique Key
			const select_q = "SELECT * FROM ukeys WHERE ukey = ? LIMIT 1";
			const insert_q = "INSERT INTO ukeys (ukey) VALUES (?)";

			await query(insert_q, [key]);
			const res = await query(select_q, [key]);

			return res[0];
		} catch (error) {
			throw error;
		}
	}
}

module.exports = Key;