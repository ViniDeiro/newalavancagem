const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dashboard_alavancagem_secret_key_2024';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const PG_URL = process.env.SUPABASE_PG_URL || process.env.DATABASE_URL;
const pgPool = PG_URL ? new Pool({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } }) : null;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configurar Content-Type para arquivos CSS
app.use(express.static('.', {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

let db = null;
if (!pgPool) {
    const dbFile = process.env.DATABASE_PATH || path.join(__dirname, 'database.db');
    db = new sqlite3.Database(dbFile, (err) => {
        if (err) {
            console.error('Erro ao conectar com o banco de dados:', err.message);
        } else {
            console.log(`✅ Conectado ao banco de dados SQLite (arquivo): ${dbFile}`);
            initializeDatabase();
        }
    });
} else {
    initializeDatabasePG();
}

// Inicializar tabelas do banco de dados
function initializeDatabase() {
    // Tabela de usuários
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        age INTEGER NOT NULL,
        initial_bankroll REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Erro ao criar tabela users:', err.message);
        } else {
            console.log('✅ Tabela users criada/verificada');
            
            // Verificar se as colunas necessárias existem e adicionar se necessário
            db.all("PRAGMA table_info(users)", (err, columns) => {
                if (err) {
                    console.error('Erro ao verificar estrutura da tabela:', err.message);
                    return;
                }
                
                const hasInitialBankroll = columns.some(col => col.name === 'initial_bankroll');
                const hasPassword = columns.some(col => col.name === 'password');
                
                if (!hasInitialBankroll) {
                    db.run("ALTER TABLE users ADD COLUMN initial_bankroll REAL NOT NULL DEFAULT 0", (err) => {
                        if (err) {
                            console.error('Erro ao adicionar coluna initial_bankroll:', err.message);
                        } else {
                            console.log('✅ Coluna initial_bankroll adicionada');
                        }
                    });
                }
                
                if (!hasPassword) {
                    db.run("ALTER TABLE users ADD COLUMN password TEXT", (err) => {
                        if (err) {
                            console.error('Erro ao adicionar coluna password:', err.message);
                        } else {
                            console.log('✅ Coluna password adicionada');
                        }
                    });
                }
            });
        }
    });

    // Tabela de alavancagens
    db.run(`CREATE TABLE IF NOT EXISTS leverages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        initial_value REAL NOT NULL,
        odd REAL NOT NULL DEFAULT 1.1,
        max_bets INTEGER NOT NULL DEFAULT 60,
        current_day INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`, (err) => {
        if (err) {
            console.error('Erro ao criar tabela leverages:', err.message);
        } else {
            console.log('✅ Tabela leverages criada/verificada');
            
            // Verificar se as colunas status e completed_at existem e adicionar se necessário
            db.all("PRAGMA table_info(leverages)", (err, columns) => {
                if (err) {
                    console.error('Erro ao verificar estrutura da tabela leverages:', err.message);
                    return;
                }
                
                const hasStatus = columns.some(col => col.name === 'status');
                const hasCompletedAt = columns.some(col => col.name === 'completed_at');
                const hasFinalValue = columns.some(col => col.name === 'final_value');
                const hasProfit = columns.some(col => col.name === 'profit');
                
                if (!hasStatus) {
                    db.run("ALTER TABLE leverages ADD COLUMN status TEXT NOT NULL DEFAULT 'active'", (err) => {
                        if (err) {
                            console.error('Erro ao adicionar coluna status:', err.message);
                        } else {
                            console.log('✅ Coluna status adicionada');
                        }
                    });
                }
                
                if (!hasCompletedAt) {
                    db.run("ALTER TABLE leverages ADD COLUMN completed_at DATETIME NULL", (err) => {
                        if (err) {
                            console.error('Erro ao adicionar coluna completed_at:', err.message);
                        } else {
                            console.log('✅ Coluna completed_at adicionada');
                        }
                    });
                }
                
                if (!hasFinalValue) {
                    db.run("ALTER TABLE leverages ADD COLUMN final_value REAL NULL", (err) => {
                        if (err) {
                            console.error('Erro ao adicionar coluna final_value:', err.message);
                        } else {
                            console.log('✅ Coluna final_value adicionada');
                        }
                    });
                }
                
                if (!hasProfit) {
                    db.run("ALTER TABLE leverages ADD COLUMN profit REAL NULL", (err) => {
                        if (err) {
                            console.error('Erro ao adicionar coluna profit:', err.message);
                        } else {
                            console.log('✅ Coluna profit adicionada');
                        }
                    });
                }
            });
        }
    });
}

async function initializeDatabasePG() {
    try {
        await pgPool.query(`CREATE TABLE IF NOT EXISTS users (
            id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            age INTEGER NOT NULL,
            initial_bankroll NUMERIC NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now()
        )`);
        await pgPool.query(`CREATE TABLE IF NOT EXISTS leverages (
            id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id),
            name TEXT NOT NULL,
            initial_value NUMERIC NOT NULL,
            odd NUMERIC NOT NULL DEFAULT 1.1,
            max_bets INTEGER NOT NULL DEFAULT 60,
            current_day INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT now(),
            completed_at TIMESTAMPTZ NULL,
            final_value NUMERIC NULL,
            profit NUMERIC NULL,
            bets JSONB NULL
        )`);
        console.log('✅ Tabelas no Postgres verificadas');
    } catch (e) {
        console.error('Erro ao inicializar Postgres:', e.message);
    }
}

// Middleware para verificar token JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

// ROTAS DE AUTENTICAÇÃO

// Cadastro de usuário
app.post('/api/register', async (req, res) => {
    const { name, password, age, bankroll } = req.body;

    if (!name || !password || !age || !bankroll) {
        return res.status(400).json({ error: 'Nome, senha, idade e banca inicial são obrigatórios' });
    }

    if (password.length < 4) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
    }

    if (age < 18) {
        return res.status(400).json({ error: 'Idade mínima é 18 anos' });
    }

    if (bankroll <= 0) {
        return res.status(400).json({ error: 'A banca inicial deve ser maior que zero' });
    }

    try {
        if (pgPool) {
            const exists = await pgPool.query('SELECT id FROM users WHERE name = $1 LIMIT 1', [name]);
            if (exists.rows.length > 0) {
                return res.status(400).json({ error: 'Usuário já existe' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const inserted = await pgPool.query('INSERT INTO users (name, password, age, initial_bankroll) VALUES ($1,$2,$3,$4) RETURNING id', [name, hashedPassword, age, bankroll]);
            const userId = inserted.rows[0].id;
            const token = jwt.sign({ userId, name }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ message: 'Usuário criado com sucesso', token, user: { id: userId, name, age, bankroll } });
        }
        if (supabase) {
            const { data: exists, error: existsErr } = await supabase.from('users').select('id').eq('name', name).limit(1);
            if (existsErr) {
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            if (exists && exists.length > 0) {
                return res.status(400).json({ error: 'Usuário já existe' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const { data: inserted, error: insertErr } = await supabase.from('users').insert({ name, password: hashedPassword, age, initial_bankroll: bankroll }).select('id').limit(1);
            if (insertErr || !inserted || !inserted[0]) {
                return res.status(500).json({ error: 'Erro ao criar usuário' });
            }
            const userId = inserted[0].id;
            const token = jwt.sign({ userId, name }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ message: 'Usuário criado com sucesso', token, user: { id: userId, name, age, bankroll } });
        }
        db.get('SELECT * FROM users WHERE name = ?', [name], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            if (row) {
                return res.status(400).json({ error: 'Usuário já existe' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            db.run('INSERT INTO users (name, password, age, initial_bankroll) VALUES (?, ?, ?, ?)', [name, hashedPassword, age, bankroll], function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erro ao criar usuário' });
                }
                const userId = this.lastID;
                const token = jwt.sign({ userId, name }, JWT_SECRET, { expiresIn: '7d' });
                res.json({ message: 'Usuário criado com sucesso', token, user: { id: userId, name, age, bankroll } });
            });
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Login de usuário
app.post('/api/login', async (req, res) => {
    const { name, password } = req.body;

    if (!name || !password) {
        return res.status(400).json({ error: 'Nome e senha são obrigatórios' });
    }

    try {
        if (pgPool) {
            const rows = await pgPool.query('SELECT * FROM users WHERE name = $1 LIMIT 1', [name]);
            const user = rows.rows[0];
            if (!user) {
                return res.status(401).json({ error: 'Usuário não encontrado' });
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Senha incorreta' });
            }
            const token = jwt.sign({ userId: user.id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ message: 'Login realizado com sucesso', token, user: { id: user.id, name: user.name, age: user.age, bankroll: parseFloat(user.initial_bankroll) } });
        }
        if (supabase) {
            const { data: rows, error: sErr } = await supabase.from('users').select('*').eq('name', name).limit(1);
            if (sErr) {
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            const user = rows && rows[0] ? rows[0] : null;
            if (!user) {
                return res.status(401).json({ error: 'Usuário não encontrado' });
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Senha incorreta' });
            }
            const token = jwt.sign({ userId: user.id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ message: 'Login realizado com sucesso', token, user: { id: user.id, name: user.name, age: user.age, bankroll: user.initial_bankroll } });
        }
        db.get('SELECT * FROM users WHERE name = ?', [name], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            if (!user) {
                return res.status(401).json({ error: 'Usuário não encontrado' });
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Senha incorreta' });
            }
            const token = jwt.sign({ userId: user.id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ message: 'Login realizado com sucesso', token, user: { id: user.id, name: user.name, age: user.age, bankroll: user.initial_bankroll } });
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Verificar token
app.get('/api/verify', authenticateToken, (req, res) => {
    if (pgPool) {
        pgPool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [req.user.userId]).then(({ rows }) => {
            const row = rows && rows[0] ? rows[0] : null;
            if (!row) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
            res.json({ user: { id: row.id, name: row.name, age: row.age } });
        }).catch(() => res.status(500).json({ error: 'Erro no servidor' }));
        return;
    }
    if (supabase) {
        supabase.from('users').select('*').eq('id', req.user.userId).limit(1).then(({ data, error }) => {
            if (error) {
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            const row = data && data[0] ? data[0] : null;
            if (!row) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
            res.json({ user: { id: row.id, name: row.name, age: row.age } });
        });
        return;
    }
    db.get('SELECT * FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({ user: { id: row.id, name: row.name, age: row.age } });
    });
});

// ROTAS DE ALAVANCAGENS

// Endpoint para obter informações do usuário
app.get('/api/user', authenticateToken, (req, res) => {
    if (pgPool) {
        (async () => {
            const uRes = await pgPool.query('SELECT id,name,age,initial_bankroll FROM users WHERE id = $1 LIMIT 1', [req.user.userId]);
            const user = uRes.rows[0];
            if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
            const aRes = await pgPool.query('SELECT COALESCE(SUM(initial_value),0) as used_bankroll FROM leverages WHERE user_id = $1 AND status = $2', [req.user.userId, 'active']);
            const used = parseFloat(aRes.rows[0].used_bankroll) || 0;
            const pRes = await pgPool.query('SELECT COALESCE(SUM(profit),0) as total_profit FROM leverages WHERE user_id = $1 AND status = $2', [req.user.userId, 'completed']);
            const totalProfit = parseFloat(pRes.rows[0].total_profit) || 0;
            const availableBankroll = parseFloat(user.initial_bankroll) - used + totalProfit;
            return res.json({ ...user, available_bankroll: availableBankroll });
        })();
        return;
    }
    if (supabase) {
        (async () => {
            const { data: users, error: uErr } = await supabase.from('users').select('id,name,age,initial_bankroll').eq('id', req.user.userId).limit(1);
            if (uErr) return res.status(500).json({ error: 'Erro ao buscar usuário' });
            const user = users && users[0] ? users[0] : null;
            if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
            const { data: actives, error: aErr } = await supabase.from('leverages').select('initial_value').eq('user_id', req.user.userId).eq('status', 'active');
            if (aErr) return res.status(500).json({ error: 'Erro ao calcular banca disponível' });
            const used = (actives || []).reduce((s, r) => s + (parseFloat(r.initial_value) || 0), 0);
            const { data: profits, error: pErr } = await supabase.from('leverages').select('profit').eq('user_id', req.user.userId).eq('status', 'completed');
            if (pErr) return res.status(500).json({ error: 'Erro ao calcular lucros' });
            const totalProfit = (profits || []).reduce((s, r) => s + (parseFloat(r.profit) || 0), 0);
            const availableBankroll = user.initial_bankroll - used + totalProfit;
            return res.json({ ...user, available_bankroll: availableBankroll });
        })();
        return;
    }
    db.get('SELECT id, name, age, initial_bankroll FROM users WHERE id = ?', 
        [req.user.userId], 
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao buscar usuário' });
            }
            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
            db.get('SELECT COALESCE(SUM(initial_value), 0) as used_bankroll FROM leverages WHERE user_id = ? AND status = "active"',
                [req.user.userId],
                (err, activeResult) => {
                    if (err) {
                        return res.status(500).json({ error: 'Erro ao calcular banca disponível' });
                    }
                    db.get('SELECT COALESCE(SUM(profit), 0) as total_profit FROM leverages WHERE user_id = ? AND status = "completed"',
                        [req.user.userId],
                        (err, profitResult) => {
                            if (err) {
                                return res.status(500).json({ error: 'Erro ao calcular lucros' });
                            }
                            const availableBankroll = user.initial_bankroll - activeResult.used_bankroll + profitResult.total_profit;
                            res.json({ ...user, available_bankroll: availableBankroll });
                        }
                    );
                }
            );
        }
    );
});

// Listar alavancagens do usuário
app.get('/api/leverages', authenticateToken, (req, res) => {
    const status = req.query.status || 'active';
    if (pgPool) {
        pgPool.query('SELECT * FROM leverages WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC', [req.user.userId, status]).then(({ rows }) => {
            const leverages = rows.map(row => ({ ...row, bets: row.bets || [] }));
            res.json(leverages);
        }).catch(() => res.status(500).json({ error: 'Erro ao buscar alavancagens' }));
        return;
    }
    if (supabase) {
        supabase.from('leverages').select('*').eq('user_id', req.user.userId).eq('status', status).order('created_at', { ascending: false }).then(({ data, error }) => {
            if (error) {
                return res.status(500).json({ error: 'Erro ao buscar alavancagens' });
            }
            const leverages = (data || []).map(row => ({ ...row, bets: row.bets || [] }));
            res.json(leverages);
        });
        return;
    }
    db.all('SELECT * FROM leverages WHERE user_id = ? AND status = ? ORDER BY created_at DESC', 
        [req.user.userId, status], 
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao buscar alavancagens' });
            }
            const leverages = rows.map(row => ({ ...row, bets: JSON.parse(row.bets || '[]') }));
            res.json(leverages);
        }
    );
});

// Criar nova alavancagem
app.post('/api/leverages', authenticateToken, (req, res) => {
    const { name, initialValue, odd = 1.1, maxBets = 60 } = req.body;

    if (!name || !initialValue) {
        return res.status(400).json({ error: 'Nome e valor inicial são obrigatórios' });
    }

    if (initialValue <= 0) {
        return res.status(400).json({ error: 'Valor inicial deve ser maior que zero' });
    }

    if (odd <= 1) {
        return res.status(400).json({ error: 'Odd deve ser maior que 1' });
    }

    if (pgPool) {
        pgPool.query('INSERT INTO leverages (user_id, name, initial_value, odd, max_bets, current_day) VALUES ($1,$2,$3,$4,$5,1) RETURNING id', [req.user.userId, name, initialValue, odd, maxBets]).then(({ rows }) => {
            const id = rows && rows[0] ? rows[0].id : null;
            res.json({ message: 'Alavancagem criada com sucesso', leverage: { id, name, initial_value: initialValue, odd, max_bets: maxBets, current_day: 1 } });
        }).catch(() => res.status(500).json({ error: 'Erro ao criar alavancagem' }));
        return;
    }
    if (supabase) {
        supabase.from('leverages').insert({ user_id: req.user.userId, name, initial_value: initialValue, odd, max_bets: maxBets, current_day: 1 }).select('id').limit(1).then(({ data, error }) => {
            if (error) {
                return res.status(500).json({ error: 'Erro ao criar alavancagem' });
            }
            const id = data && data[0] ? data[0].id : null;
            res.json({ message: 'Alavancagem criada com sucesso', leverage: { id, name, initial_value: initialValue, odd, max_bets: maxBets, current_day: 1 } });
        });
        return;
    }
    db.run('INSERT INTO leverages (user_id, name, initial_value, odd, max_bets) VALUES (?, ?, ?, ?, ?)', [req.user.userId, name, initialValue, odd, maxBets], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erro ao criar alavancagem' });
        }
        res.json({ message: 'Alavancagem criada com sucesso', leverage: { id: this.lastID, name, initial_value: initialValue, odd, max_bets: maxBets, current_day: 1 } });
    });
});

// Atualizar dia da alavancagem
app.put('/api/leverages/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { currentDay } = req.body;

    if (!currentDay || currentDay < 1) {
        return res.status(400).json({ error: 'Dia atual inválido' });
    }

    if (pgPool) {
        pgPool.query('UPDATE leverages SET current_day = $1 WHERE id = $2 AND user_id = $3 RETURNING id', [currentDay, id, req.user.userId]).then(({ rows }) => {
            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: 'Alavancagem não encontrada' });
            }
            res.json({ message: 'Alavancagem atualizada com sucesso' });
        }).catch(() => res.status(500).json({ error: 'Erro ao atualizar alavancagem' }));
        return;
    }
    if (supabase) {
        supabase.from('leverages').update({ current_day: currentDay }).eq('id', id).eq('user_id', req.user.userId).then(({ error, data }) => {
            if (error) {
                return res.status(500).json({ error: 'Erro ao atualizar alavancagem' });
            }
            if (!data || data.length === 0) {
                return res.status(404).json({ error: 'Alavancagem não encontrada' });
            }
            res.json({ message: 'Alavancagem atualizada com sucesso' });
        });
        return;
    }
    db.run('UPDATE leverages SET current_day = ? WHERE id = ? AND user_id = ?', [currentDay, id, req.user.userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erro ao atualizar alavancagem' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Alavancagem não encontrada' });
        }
        res.json({ message: 'Alavancagem atualizada com sucesso' });
    });
});

// Encerrar alavancagem
app.patch('/api/leverages/:id/complete', authenticateToken, (req, res) => {
    const leverageId = req.params.id;
    if (pgPool) {
        (async () => {
            const rows = await pgPool.query('SELECT * FROM leverages WHERE id = $1 AND user_id = $2 AND status = $3 LIMIT 1', [leverageId, req.user.userId, 'active']);
            const leverage = rows.rows[0];
            if (!leverage) return res.status(404).json({ error: 'Alavancagem não encontrada ou já encerrada' });
            const currentValue = parseFloat(leverage.initial_value) * Math.pow(parseFloat(leverage.odd), parseInt(leverage.current_day) - 1);
            const profit = currentValue - parseFloat(leverage.initial_value);
            await pgPool.query('UPDATE leverages SET status = $1, completed_at = now(), final_value = $2, profit = $3 WHERE id = $4', ['completed', currentValue, profit, leverageId]);
            return res.json({ message: 'Alavancagem encerrada com sucesso', finalValue: currentValue, profit, initialValue: parseFloat(leverage.initial_value) });
        })().catch(() => res.status(500).json({ error: 'Erro ao encerrar alavancagem' }));
        return;
    }
    if (supabase) {
        (async () => {
            const { data: rows, error: gErr } = await supabase.from('leverages').select('*').eq('id', leverageId).eq('user_id', req.user.userId).eq('status', 'active').limit(1);
            if (gErr) return res.status(500).json({ error: 'Erro ao buscar alavancagem' });
            const leverage = rows && rows[0] ? rows[0] : null;
            if (!leverage) return res.status(404).json({ error: 'Alavancagem não encontrada ou já encerrada' });
            const currentValue = leverage.initial_value * Math.pow(leverage.odd, leverage.current_day - 1);
            const profit = currentValue - leverage.initial_value;
            const { error: uErr } = await supabase.from('leverages').update({ status: 'completed', completed_at: new Date().toISOString(), final_value: currentValue, profit }).eq('id', leverageId);
            if (uErr) return res.status(500).json({ error: 'Erro ao encerrar alavancagem' });
            return res.json({ message: 'Alavancagem encerrada com sucesso', finalValue: currentValue, profit, initialValue: leverage.initial_value });
        })();
        return;
    }
    db.get('SELECT * FROM leverages WHERE id = ? AND user_id = ? AND status = "active"', [leverageId, req.user.userId], (err, leverage) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar alavancagem' });
        }
        if (!leverage) {
            return res.status(404).json({ error: 'Alavancagem não encontrada ou já encerrada' });
        }
        const currentValue = leverage.initial_value * Math.pow(leverage.odd, leverage.current_day - 1);
        const profit = currentValue - leverage.initial_value;
        db.run('UPDATE leverages SET status = "completed", completed_at = CURRENT_TIMESTAMP, final_value = ?, profit = ? WHERE id = ?', [currentValue, profit, leverageId], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erro ao encerrar alavancagem' });
            }
            res.json({ message: 'Alavancagem encerrada com sucesso', finalValue: currentValue, profit, initialValue: leverage.initial_value });
        });
    });
});

// Deletar alavancagem
app.delete('/api/leverages/:id', authenticateToken, (req, res) => {
    const leverageId = req.params.id;
    if (pgPool) {
        pgPool.query('DELETE FROM leverages WHERE id = $1 AND user_id = $2', [leverageId, req.user.userId]).then(() => {
            res.json({ message: 'Alavancagem deletada com sucesso' });
        }).catch(() => res.status(500).json({ error: 'Erro ao deletar alavancagem' }));
        return;
    }
    if (supabase) {
        supabase.from('leverages').delete().eq('id', leverageId).eq('user_id', req.user.userId).then(({ error }) => {
            if (error) {
                return res.status(500).json({ error: 'Erro ao deletar alavancagem' });
            }
            res.json({ message: 'Alavancagem deletada com sucesso' });
        });
        return;
    }
    db.run('DELETE FROM leverages WHERE id = ? AND user_id = ?', [leverageId, req.user.userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erro ao deletar alavancagem' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Alavancagem não encontrada' });
        }
        res.json({ message: 'Alavancagem deletada com sucesso' });
    });
});

// Resetar alavancagem
app.put('/api/leverages/:id/reset', authenticateToken, (req, res) => {
    const { id } = req.params;
    if (pgPool) {
        pgPool.query('UPDATE leverages SET current_day = 1 WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.user.userId]).then(({ rows }) => {
            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: 'Alavancagem não encontrada' });
            }
            res.json({ message: 'Alavancagem resetada com sucesso' });
        }).catch(() => res.status(500).json({ error: 'Erro ao resetar alavancagem' }));
        return;
    }
    if (supabase) {
        supabase.from('leverages').update({ current_day: 1 }).eq('id', id).eq('user_id', req.user.userId).then(({ error, data }) => {
            if (error) {
                return res.status(500).json({ error: 'Erro ao resetar alavancagem' });
            }
            if (!data || data.length === 0) {
                return res.status(404).json({ error: 'Alavancagem não encontrada' });
            }
            res.json({ message: 'Alavancagem resetada com sucesso' });
        });
        return;
    }
    db.run('UPDATE leverages SET current_day = 1 WHERE id = ? AND user_id = ?', [id, req.user.userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erro ao resetar alavancagem' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Alavancagem não encontrada' });
        }
        res.json({ message: 'Alavancagem resetada com sucesso' });
    });
});

// Rota para servir o frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Catch-all handler: serve index.html para qualquer rota que não seja da API
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log('📊 Dashboard de Alavancagem - 8-bit Style');
});

// Fechar conexão com o banco ao encerrar o servidor
process.on('SIGINT', () => {
    if (pgPool) {
        pgPool.end().then(() => {
            console.log('🔒 Conexão com Postgres fechada');
            process.exit(0);
        }).catch(() => process.exit(0));
        return;
    }
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Erro ao fechar banco de dados:', err.message);
            } else {
                console.log('🔒 Conexão com banco de dados fechada');
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
