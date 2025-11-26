// Estado global da aplicação
let leverages = [];
let completedLeverages = [];
let currentLeverageIndex = -1;
let currentUser = null;
let userBankroll = { initial: 0, available: 0 };
let authToken = null;

// API Base URL - detecta automaticamente produção vs desenvolvimento
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : `${window.location.origin}/api`;

// Carregar dados ao iniciar
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
});

// Verificar status de autenticação
async function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const response = await fetch(`${API_BASE}/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                authToken = token;
                currentUser = data.user;
                showMainApp();
                try {
                    await loadUserInfo();
                    await loadLeverages();
                    renderDashboard();
                    updateTotalValue();
                } catch (uiError) {
                    console.warn('Erro ao carregar interface, mas autenticação bem-sucedida:', uiError);
                    // Continua mesmo com erro na interface
                }
            } else {
                localStorage.removeItem('authToken');
                showAuthScreen();
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
            showAuthScreen();
        }
    } else {
        showAuthScreen();
    }
}

// Mostrar tela de autenticação
function showAuthScreen() {
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
}

// Mostrar aplicação principal
function showMainApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    if (currentUser) {
        document.getElementById('welcomeText').textContent = `Bem-vindo, ${currentUser.name}!`;
    }
}

// Alternar entre login e cadastro
function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.auth-tab')[0].classList.add('active');
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.auth-tab')[1].classList.add('active');
}

// Fazer login
async function login() {
    const name = document.getElementById('loginName').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    if (!name) {
        showNotification('Por favor, digite seu nome!');
        return;
    }
    
    if (!password) {
        showNotification('Por favor, digite sua senha!');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            
            showMainApp();
            await loadUserInfo(); // Carregar informações da banca
            await loadLeverages();
            renderDashboard();
            updateTotalValue();
            
            showNotification(`Bem-vindo de volta, ${currentUser.name}!`);
        } else {
            showNotification(data.error || 'Erro ao fazer login');
        }
    } catch (error) {
        console.error('Erro no login:', error);
        showNotification('Erro de conexão. Verifique se o servidor está rodando.');
    }
}

// Fazer cadastro
async function register() {
    const name = document.getElementById('registerName').value.trim();
    const password = document.getElementById('registerPassword').value.trim();
    const age = parseInt(document.getElementById('registerAge').value);
    const bankroll = parseFloat(document.getElementById('registerBankroll').value);
    
    if (!name) {
        showNotification('Por favor, digite seu nome!');
        return;
    }
    
    if (!password) {
        showNotification('Por favor, digite uma senha!');
        return;
    }
    
    if (password.length < 4) {
        showNotification('A senha deve ter pelo menos 4 caracteres!');
        return;
    }

    if (!age || age < 18) {
        showNotification('Idade mínima é 18 anos!');
        return;
    }

    if (!bankroll || bankroll <= 0) {
        showNotification('A banca inicial deve ser maior que zero!');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, password, age, bankroll })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            
            showMainApp();
            await loadUserInfo();
            await loadLeverages();
            renderDashboard();
            updateTotalValue();
            
            showNotification(`Conta criada com sucesso! Bem-vindo, ${currentUser.name}!`);
        } else {
            showNotification(data.error || 'Erro ao criar conta');
        }
    } catch (error) {
        console.error('Erro no cadastro:', error);
        showNotification('Erro de conexão. Verifique se o servidor está rodando.');
    }
}

// Fazer logout
function logout() {
    if (confirm('Tem certeza que deseja sair?')) {
        localStorage.removeItem('authToken');
        authToken = null;
        currentUser = null;
        leverages = [];
        showAuthScreen();
        showNotification('Logout realizado com sucesso!');
    }
}

// Classe para gerenciar uma alavancagem
class Leverage {
    constructor(name, initialValue, odd = 1.1, maxBets = 60) {
        this.name = name;
        this.initialValue = parseFloat(initialValue);
        this.odd = parseFloat(odd);
        this.maxBets = parseInt(maxBets);
        this.currentDay = 1;
        this.id = Date.now() + Math.random(); // ID único
    }

    // Calcular valor atual baseado no dia
    getCurrentValue() {
        const initialValue = parseFloat(this.initialValue) || 0;
        const odd = parseFloat(this.odd) || 1.1;
        const currentDay = parseInt(this.currentDay) || 1;
        
        if (initialValue <= 0 || odd <= 0 || currentDay < 1) {
            return 0;
        }
        
        return initialValue * Math.pow(odd, currentDay - 1);
    }

    // Calcular próximo valor
    getNextValue() {
        if (this.currentDay >= this.maxBets) return this.getCurrentValue();
        return this.initialValue * Math.pow(this.odd, this.currentDay);
    }

    // Calcular valor final
    getFinalValue() {
        return this.initialValue * Math.pow(this.odd, this.maxBets - 1);
    }

    // Calcular lucro total
    getTotalProfit() {
        return this.getFinalValue() - this.initialValue;
    }

    // Calcular progresso em porcentagem
    getProgress() {
        return (this.currentDay / this.maxBets) * 100;
    }

    // Avançar um dia
    nextDay() {
        if (this.currentDay < this.maxBets) {
            this.currentDay++;
            return true;
        }
        return false;
    }

    // Voltar um dia
    previousDay() {
        if (this.currentDay > 1) {
            this.currentDay--;
            return true;
        }
        return false;
    }

    // Serializar para JSON
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            initial_value: this.initialValue,
            odd: this.odd,
            max_bets: this.maxBets,
            current_day: this.currentDay
        };
    }

    // Criar instância a partir de dados do servidor
    static fromJSON(data) {
        if (!data || typeof data !== 'object') {
            console.error('Dados inválidos para criar Leverage:', data);
            return null;
        }
        
        const name = data.name || 'Sem nome';
        const initialValue = parseFloat(data.initial_value) || 0;
        const odd = parseFloat(data.odd) || 1.1;
        const maxBets = parseInt(data.max_bets) || 60;
        
        if (initialValue <= 0) {
            console.error('Valor inicial inválido:', data);
            return null;
        }
        
        const leverage = new Leverage(name, initialValue, odd, maxBets);
        leverage.currentDay = parseInt(data.current_day) || 1;
        leverage.serverID = data.id; // ID do servidor
        leverage.id = data.id; // Usar ID do servidor como ID local também
        
        // Adicionar campos para alavancagens completadas
        if (data.final_value !== undefined && data.final_value !== null) {
            leverage.finalValue = parseFloat(data.final_value) || 0;
        }
        if (data.profit !== undefined && data.profit !== null) {
            leverage.profit = parseFloat(data.profit) || 0;
        }
        
        return leverage;
    }
}

// Funções de persistência
async function saveLeverages() {
    if (!authToken) return;
    
    console.log('🔄 saveLeverages() iniciado');
    console.log('📊 Alavancagens para salvar:', leverages.length);
    
    try {
        // Atualizar cada alavancagem individualmente
        for (const leverage of leverages) {
            console.log(`📝 Processando alavancagem: ${leverage.name}`);
            console.log(`   - ID: ${leverage.id}, ServerID: ${leverage.serverID}`);
            console.log(`   - Current Day: ${leverage.currentDay}`);
            
            if (leverage.id && leverage.serverID) {
                console.log(`🚀 Enviando PUT para /leverages/${leverage.serverID}`);
                
                const response = await fetch(`${API_BASE}/leverages/${leverage.serverID}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        currentDay: leverage.currentDay
                    })
                });
                
                console.log(`📡 Response status: ${response.status}`);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ Erro ao atualizar alavancagem ${leverage.serverID}:`, errorText);
                } else {
                    console.log(`✅ Alavancagem ${leverage.serverID} atualizada com sucesso`);
                }
            } else {
                console.log(`⚠️ Alavancagem ${leverage.name} não tem ID ou ServerID válido`);
            }
        }
        console.log('✅ saveLeverages() concluído');
    } catch (error) {
        console.error('❌ Erro ao salvar alavancagens:', error);
        showNotification('Erro ao salvar dados no servidor');
    }
}

// Função para carregar informações do usuário
async function loadUserInfo() {
    if (!authToken) return;

    try {
        const response = await fetch(`${API_BASE}/user`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            userBankroll = {
                initial: userData.initial_bankroll,
                available: userData.available_bankroll
            };
            updateBankrollDisplay();
        } else {
            console.error('Erro ao carregar informações do usuário');
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function loadLeverages() {
    if (!authToken) return;
    
    try {
        // Carregar alavancagens ativas
        const activeResponse = await fetch(`${API_BASE}/leverages?status=active`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (activeResponse.ok) {
            const activeData = await activeResponse.json();
            // A API retorna um array diretamente, não um objeto com propriedade leverages
            leverages = activeData.map(item => Leverage.fromJSON(item)).filter(item => item !== null);
        } else {
            leverages = [];
        }

        // Carregar alavancagens concluídas
        const completedResponse = await fetch(`${API_BASE}/leverages?status=completed`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (completedResponse.ok) {
            const completedData = await completedResponse.json();
            // A API retorna um array diretamente, não um objeto com propriedade leverages
            completedLeverages = completedData.map(item => Leverage.fromJSON(item)).filter(item => item !== null);
        }

    } catch (error) {
        console.error('Erro ao carregar alavancagens:', error);
        leverages = [];
        showNotification('Erro ao carregar dados do servidor');
    }
}

// Renderizar dashboard principal
function renderDashboard() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid) return;
    
    grid.innerHTML = '';

    leverages.forEach((leverage, index) => {
        if (!leverage || leverage.initialValue == null || leverage.currentDay == null) return;
        
        const card = document.createElement('div');
        card.className = 'leverage-card';
        card.onclick = () => showLeverageDetail(index);

        const currentValue = leverage.getCurrentValue() || 0;
        const progress = leverage.getProgress() || 0;

        card.innerHTML = `
            <div class="leverage-card-name">${leverage.name || 'Sem nome'}</div>
            <div class="leverage-card-day">Aposta ${leverage.currentDay}</div>
            <div class="leverage-card-value">R$ ${currentValue.toFixed(2)}</div>
            <div class="leverage-card-progress">${leverage.currentDay}/${leverage.maxBets} (${progress.toFixed(1)}%)</div>
            <button class="end-leverage-button" onclick="event.stopPropagation(); endLeverageById('${leverage.serverID || leverage.id}')">
                🏁 ENCERRAR ALAVANCAGEM
            </button>
        `;

        grid.appendChild(card);
    });

    // Renderizar alavancagens concluídas
    renderCompletedLeverages();
    
    // Atualizar display da banca
    updateBankrollDisplay();
}

function renderCompletedLeverages() {
    const completedSection = document.getElementById('completedSection');
    const completedGrid = document.getElementById('completedGrid');
    
    if (completedLeverages.length === 0) {
        completedSection.style.display = 'none';
        return;
    }
    
    completedSection.style.display = 'block';
    completedGrid.innerHTML = '';

    completedLeverages.forEach((leverage, index) => {
        const card = document.createElement('div');
        card.className = 'completed-leverage';

        // Usar dados salvos do servidor ou calcular como fallback
        const finalValue = leverage.finalValue || leverage.getCurrentValue();
        const profit = leverage.profit !== undefined ? leverage.profit : (finalValue - leverage.initialValue);
        
        const resultColor = profit >= 0 ? '#00ff00' : '#ff6b6b';
        const resultText = profit >= 0 ? `+R$ ${profit.toFixed(2)}` : `-R$ ${Math.abs(profit).toFixed(2)}`;

        card.innerHTML = `
            <div class="leverage-header">
                <h3>${leverage.name}</h3>
                <span class="result-badge" style="color: ${resultColor}">${resultText}</span>
            </div>
            <div class="leverage-stats">
                <div class="stat">
                    <span class="stat-label">Inicial:</span>
                    <span class="stat-value">R$ ${leverage.initialValue.toFixed(2)}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Final:</span>
                    <span class="stat-value">R$ ${finalValue.toFixed(2)}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Lucro:</span>
                    <span class="stat-value" style="color: ${resultColor}">R$ ${profit.toFixed(2)}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Meta:</span>
                    <span class="stat-value">R$ ${leverage.getFinalValue().toFixed(2)}</span>
                </div>
            </div>
        `;

        completedGrid.appendChild(card);
    });
}

// Calcular e atualizar valor total
function updateTotalValue() {
    const totalElement = document.getElementById('totalValue');
    if (totalElement) {
        try {
            const total = leverages.reduce((sum, leverage) => {
                if (leverage && typeof leverage.getCurrentValue === 'function') {
                    const currentValue = leverage.getCurrentValue();
                    return sum + (isNaN(currentValue) ? 0 : currentValue);
                }
                return sum;
            }, 0);
            totalElement.textContent = `R$ ${total.toFixed(2)}`;
        } catch (error) {
            console.error('Erro ao calcular total:', error);
            totalElement.textContent = 'R$ 0,00';
        }
    }
}

// Mostrar detalhes de uma alavancagem
function showLeverageDetail(index) {
    currentLeverageIndex = index;
    const leverage = leverages[index];
    
    document.getElementById('leverageName').textContent = leverage.name;
    updateDetailDisplay();
    
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('detailScreen').style.display = 'block';
}

// Atualizar display da tela de detalhes
function updateDetailDisplay() {
    if (currentLeverageIndex === -1) return;
    
    const leverage = leverages[currentLeverageIndex];
    if (!leverage || leverage.initialValue == null) return;
    
    const currentDayEl = document.getElementById('currentDay');
    const currentValueEl = document.getElementById('currentValue');
    const nextValueEl = document.getElementById('nextValue');
    const finalValueEl = document.getElementById('finalValue');
    const totalProfitEl = document.getElementById('totalProfit');
    const progressTextEl = document.getElementById('progressText');
    const progressFillEl = document.getElementById('progressFill');
    
    if (currentDayEl) currentDayEl.textContent = leverage.currentDay;
    if (currentValueEl) currentValueEl.textContent = `R$ ${(leverage.getCurrentValue() || 0).toFixed(2)}`;
    if (nextValueEl) nextValueEl.textContent = `R$ ${(leverage.getNextValue() || 0).toFixed(2)}`;
    if (finalValueEl) finalValueEl.textContent = `R$ ${(leverage.getFinalValue() || 0).toFixed(2)}`;
    if (totalProfitEl) totalProfitEl.textContent = `R$ ${(leverage.getTotalProfit() || 0).toFixed(2)}`;
    if (progressTextEl) progressTextEl.textContent = `${leverage.currentDay}/${leverage.maxBets}`;
    if (progressFillEl) progressFillEl.style.width = `${leverage.getProgress() || 0}%`;
    
    // Atualizar estado dos botões
    const upButton = document.querySelector('.nav-button.up');
    const downButton = document.querySelector('.nav-button.down');
    
    if (upButton) upButton.disabled = leverage.currentDay >= leverage.maxBets;
    if (downButton) downButton.disabled = leverage.currentDay <= 1;
}

// Próximo dia
async function nextDay() {
    if (currentLeverageIndex === -1) return;
    
    const leverage = leverages[currentLeverageIndex];
    if (leverage.nextDay()) {
        updateDetailDisplay();
        await saveLeverages();
        // Atualizar dashboard em background
        renderDashboard();
        updateTotalValue();
    }
}

// Dia anterior
async function previousDay() {
    if (currentLeverageIndex === -1) return;
    
    const leverage = leverages[currentLeverageIndex];
    if (leverage.previousDay()) {
        updateDetailDisplay();
        await saveLeverages();
        // Atualizar dashboard em background
        renderDashboard();
        updateTotalValue();
    }
}

function updateBankrollDisplay() {
    const bankrollElement = document.getElementById('bankrollText');
    if (bankrollElement && userBankroll && typeof userBankroll.available === 'number') {
        bankrollElement.textContent = `Banca: R$ ${userBankroll.available.toFixed(2)}`;
        
        // Mudar cor baseado na disponibilidade
        if (userBankroll.available <= 0) {
            bankrollElement.style.color = '#ff6b6b';
            bankrollElement.style.borderColor = '#ff6b6b';
        } else if (userBankroll.available < (userBankroll.initial || 0) * 0.2) {
            bankrollElement.style.color = '#ffd700';
            bankrollElement.style.borderColor = '#ffd700';
        } else {
            bankrollElement.style.color = '#00ff00';
            bankrollElement.style.borderColor = '#00ff00';
        }
    } else if (bankrollElement) {
        bankrollElement.textContent = 'Banca: R$ 0.00';
        bankrollElement.style.color = '#ff6b6b';
        bankrollElement.style.borderColor = '#ff6b6b';
    }
}

// Voltar ao dashboard
function showDashboard() {
    document.getElementById('detailScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    currentLeverageIndex = -1;
}

// Modal para adicionar nova alavancagem
function showAddLeverageModal() {
    document.getElementById('addModal').style.display = 'flex';
    // Limpar campos
    document.getElementById('leverageNameInput').value = '';
    document.getElementById('initialValueInput').value = '';
    document.getElementById('oddValueInput').value = '1.1';
    document.getElementById('maxBetsInput').value = '60';
}

function hideAddLeverageModal() {
    document.getElementById('addModal').style.display = 'none';
}

// Criar nova alavancagem
async function createLeverage() {
    const name = document.getElementById('leverageNameInput').value.trim();
    const initialValue = parseFloat(document.getElementById('initialValueInput').value);
    const odd = parseFloat(document.getElementById('oddValueInput').value);
    const maxBets = parseInt(document.getElementById('maxBetsInput').value);

    // Validações
    if (!name) {
        alert('Por favor, insira um nome para a alavancagem!');
        return;
    }

    if (!initialValue || initialValue <= 0) {
        alert('Por favor, insira um valor inicial válido!');
        return;
    }

    if (!odd || odd <= 1) {
        alert('Por favor, insira uma odd válida (maior que 1)!');
        return;
    }

    if (!maxBets || maxBets <= 0) {
        alert('Por favor, insira um número válido de apostas!');
        return;
    }

    // Verificar se há banca disponível
    if (initialValue > userBankroll.available) {
        alert(`Banca insuficiente! Você tem apenas R$ ${userBankroll.available.toFixed(2)} disponível.`);
        return;
    }

    try {
        // Enviar dados para a API
        const response = await fetch(`${API_BASE}/leverages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name: name,
                initialValue: initialValue,
                odd: odd,
                maxBets: maxBets
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao criar alavancagem');
        }

        const result = await response.json();
        showNotification('Alavancagem criada com sucesso!');
        
        // Recarregar dados e atualizar interface
        await loadLeverages();
        await loadUserInfo();
        renderDashboard();
        updateTotalValue();
        hideAddLeverageModal();
        
    } catch (error) {
        console.error('Erro ao criar alavancagem:', error);
        showNotification('Erro ao criar alavancagem: ' + error.message);
    }

    // Mostrar feedback visual
    showNotification(`Alavancagem "${name}" criada com sucesso!`);
}

// Função para encerrar alavancagem por ID
async function endLeverageById(leverageId) {
    console.log('endLeverageById chamada com ID:', leverageId);
    
    if (!leverageId) {
        console.error('ID da alavancagem não fornecido');
        showNotification('Erro: ID da alavancagem não encontrado');
        return;
    }
    
    // Encontrar a alavancagem pelo ID
    const leverage = leverages.find(l => (l.serverID || l.id) == leverageId);
    console.log('leverage encontrada:', leverage);
    
    if (!leverage) {
        console.error('Leverage não encontrada com ID:', leverageId);
        showNotification('Erro: Alavancagem não encontrada');
        return;
    }
    
    const confirmEnd = confirm(`Tem certeza que deseja encerrar a alavancagem "${leverage.name}"?`);
    
    if (!confirmEnd) return;
    
    try {
        console.log('Sincronizando current_day antes de encerrar...');
        // IMPORTANTE: Sincronizar o current_day atual antes de encerrar
        await saveLeverages();
        
        console.log('Enviando requisição para encerrar alavancagem ID:', leverageId);
        
        const response = await fetch(`${API_BASE}/leverages/${leverageId}/complete`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Response data:', data);
            const { finalValue, profit, initialValue } = data;
            
            // Recarregar dados do servidor
            await loadLeverages();
            await loadUserInfo();
            renderDashboard();
            updateTotalValue();
            
            // Mostrar notificação com detalhes do lucro
            const profitMessage = profit > 0 
                ? `Alavancagem encerrada com sucesso! 🎉\nValor inicial: R$ ${initialValue.toFixed(2)}\nValor final: R$ ${finalValue.toFixed(2)}\nLucro: R$ ${profit.toFixed(2)}`
                : `Alavancagem encerrada.\nValor inicial: R$ ${initialValue.toFixed(2)}\nValor final: R$ ${finalValue.toFixed(2)}\nPrejuízo: R$ ${Math.abs(profit).toFixed(2)}`;
            
            showNotification(profitMessage);
        } else {
            const errorText = await response.text();
            console.error('Erro na resposta:', response.status, errorText);
            try {
                const data = JSON.parse(errorText);
                showNotification(data.error || 'Erro ao encerrar alavancagem');
            } catch (e) {
                showNotification(`Erro ao encerrar alavancagem: ${response.status}`);
            }
        }
    } catch (error) {
        console.error('Erro na requisição:', error);
        showNotification('Erro de conexão: ' + error.message);
    }
}

// Função para encerrar alavancagem (mantida para compatibilidade)
async function endLeverage(index) {
    console.log('endLeverage chamada com index:', index);
    console.log('leverages array:', leverages);
    console.log('leverages.length:', leverages.length);
    
    if (index < 0 || index >= leverages.length) {
        console.error('Índice inválido:', index);
        showNotification('Erro: Alavancagem não encontrada');
        return;
    }
    
    const leverage = leverages[index];
    console.log('leverage selecionada:', leverage);
    
    if (!leverage) {
        console.error('Leverage não encontrada no índice:', index);
        showNotification('Erro: Alavancagem não encontrada');
        return;
    }
    
    const leverageId = leverage.serverID || leverage.id;
    await endLeverageById(leverageId);
}

// Sistema de notificações
function showNotification(message) {
    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #000;
        border: 2px solid #00ff00;
        color: #00ff00;
        padding: 15px 20px;
        font-family: 'Press Start 2P', monospace;
        font-size: 10px;
        z-index: 3000;
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.5);
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;

    // Adicionar animação CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remover após 3 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Função para deletar alavancagem (funcionalidade extra)
async function deleteLeverage(index) {
    if (confirm(`Tem certeza que deseja deletar a alavancagem "${leverages[index].name}"?`)) {
        leverages.splice(index, 1);
        await saveLeverages();
        renderDashboard();
        updateTotalValue();
        showNotification('Alavancagem deletada com sucesso!');
    }
}

// Eventos de teclado para navegação rápida
document.addEventListener('keydown', async function(event) {
    // Apenas na tela de detalhes
    if (document.getElementById('detailScreen').style.display === 'block') {
        switch(event.key) {
            case 'ArrowUp':
                event.preventDefault();
                await nextDay();
                break;
            case 'ArrowDown':
                event.preventDefault();
                await previousDay();
                break;
            case 'Escape':
                event.preventDefault();
                showDashboard();
                break;
        }
    }
});

// Fechar modal com ESC
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && document.getElementById('addModal').style.display === 'flex') {
        hideAddLeverageModal();
    }
});

// Função para exportar dados (funcionalidade extra)
function exportData() {
    const dataStr = JSON.stringify(leverages, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alavancagens_backup.json';
    link.click();
    URL.revokeObjectURL(url);
    showNotification('Dados exportados com sucesso!');
}

// Função para importar dados (funcionalidade extra)
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            leverages = data.map(item => {
                const leverage = new Leverage(item.name, item.initialValue, item.odd, item.maxBets);
                leverage.currentDay = item.currentDay;
                leverage.id = item.id;
                return leverage;
            });
            await saveLeverages();
            renderDashboard();
            updateTotalValue();
            showNotification('Dados importados com sucesso!');
        } catch (error) {
            alert('Erro ao importar dados. Verifique se o arquivo está correto.');
        }
    };
    reader.readAsText(file);
}

// Função para resetar uma alavancagem
async function resetLeverage(index) {
    if (confirm(`Tem certeza que deseja resetar a alavancagem "${leverages[index].name}" para o dia 1?`)) {
        leverages[index].currentDay = 1;
        await saveLeverages();
        renderDashboard();
        updateTotalValue();
        if (currentLeverageIndex === index) {
            updateDetailDisplay();
        }
        showNotification('Alavancagem resetada com sucesso!');
    }
}

// Adicionar menu de contexto nos cards (clique direito)
document.addEventListener('contextmenu', function(event) {
    const card = event.target.closest('.leverage-card');
    if (card) {
        event.preventDefault();
        const index = Array.from(card.parentNode.children).indexOf(card);
        showContextMenu(event.clientX, event.clientY, index);
    }
});

function showContextMenu(x, y, index) {
    // Remover menu existente
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
        position: fixed;
        top: ${y}px;
        left: ${x}px;
        background: #000;
        border: 2px solid #00ff00;
        z-index: 4000;
        font-family: 'Press Start 2P', monospace;
        font-size: 8px;
    `;

    menu.innerHTML = `
        <div class="context-item" onclick="resetLeverage(${index}); removeContextMenu();">RESETAR</div>
        <div class="context-item" onclick="deleteLeverage(${index}); removeContextMenu();">DELETAR</div>
    `;

    // Adicionar estilos para os itens do menu
    const style = document.createElement('style');
    style.textContent = `
        .context-item {
            padding: 10px 15px;
            color: #00ff00;
            cursor: pointer;
            border-bottom: 1px solid #00ff00;
        }
        .context-item:hover {
            background: #00ff00;
            color: #000;
        }
        .context-item:last-child {
            border-bottom: none;
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(menu);

    // Remover menu ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', removeContextMenu);
    }, 100);
}

function removeContextMenu() {
    const menu = document.querySelector('.context-menu');
    if (menu) {
        menu.remove();
    }
    document.removeEventListener('click', removeContextMenu);
}

// Função para formatar números com separadores de milhares
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Atualizar todas as exibições de moeda para usar formatação
function updateCurrencyDisplays() {
    // Esta função pode ser chamada para atualizar a formatação se necessário
    renderDashboard();
    updateTotalValue();
    if (currentLeverageIndex !== -1) {
        updateDetailDisplay();
    }
}