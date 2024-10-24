const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost', // Cambia esto según tu configuración
  user: 'root',      // Cambia esto según tu configuración
  password: '',      // Cambia esto según tu configuración
  database: 'tiendasalinas_db',  // Cambia esto según tu configuración
  connectionLimit: 10 // Número máximo de conexiones en el pool
});

const promisePool = pool.promise();

module.exports = promisePool;