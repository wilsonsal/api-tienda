const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'MYSQL8003.site4now.net', // Cambia esto según tu configuración
  user: 'aae0e7_prueba',      // Cambia esto según tu configuración
  password: 'Salinas3443',      // Cambia esto según tu configuración
  database: 'db_aae0e7_prueba',  // Cambia esto según tu configuración
  connectionLimit: 10 // Número máximo de conexiones en el pool
});

const promisePool = pool.promise();

module.exports = promisePool;