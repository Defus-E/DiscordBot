// const mongoose = require('mongoose');
const util = require('util');
const mysql = require('mysql');
const config = require('../config');

const conn = mysql.createConnection(config.get('mysql')); // connection
conn.connect(err => err ? console.error(err) : console.log('Connected!'));

const query = util.promisify(conn.query).bind(conn);

module.exports = query;