const { Pool } = require('pg');

const dbPool = new Pool({
  // database: 'personal_web_b29',
  // port: 5432,
  // user: 'postgres',
  // password: 'root',
  connectionString:
    'postgres://rgmsybiqbbwcui:333cec9d3964a901bfce415394b496e72fa87fc3de9ebdf9f80d175ec1eb1deb@ec2-52-70-205-234.compute-1.amazonaws.com:5432/dban8a6lk16hvq',
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = dbPool;
