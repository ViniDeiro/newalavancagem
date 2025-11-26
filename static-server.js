const express = require('express');
const path = require('path');

const app = express();
const PORT = 8080;

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname)));

// Rota para a página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor estático rodando em http://localhost:${PORT}`);
    console.log(`📱 Acesse o dashboard em: http://localhost:${PORT}`);
});