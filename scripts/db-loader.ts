import { Pool } from 'pg';

const TABLE_NAME = 'DummyPain';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pain_db';
const pool = new Pool({ connectionString });

// Single query
async function getRows() {
  const result = await pool.query(`SELECT * FROM ${TABLE_NAME}`);
  console.log(result.rows);
}

// Parameterized query (prevents SQL injection)
async function getRowById(id: number) {
  const result = await pool.query(`SELECT * FROM ${TABLE_NAME} WHERE id = $1`, [id]);
  return result.rows[0];
}

function syncGetRowById(id: number): Promise<any> {
  return pool.query(`SELECT * FROM ${TABLE_NAME} WHERE id = $1`, [id])
    .then((result: { rows: any[]; }) => result.rows[0])
    .catch((err: any) => {
      console.error('Error executing query', err);
      throw err;
    });
}

export { getRows, getRowById, syncGetRowById };
