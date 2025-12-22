// Configuration globale
let supabaseClient = null;
let currentUser = null;
let accessToken = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Charger les valeurs sauvegardées
    loadSavedConfig();
    
    // Vérifier si l'utilisateur est connecté
    checkAuthStatus();
    
    log('info', '✅ Interface de test chargée');
    log('info', '📌 Étape 1: Remplissez Supabase URL et Key, puis cliquez "Sauvegarder Configuration"');
    log('info', '📌 Étape 2: Utilisez "Connexion" ou "Inscription" pour vous authentifier');
    
    // Test: Vérifier que les fonctions sont disponibles
    if (typeof register === 'function') {
        log('success', '✅ Fonction register() chargée');
    }
    if (typeof login === 'function') {
        log('success', '✅ Fonction login() chargée');
    }
    if (typeof switchTab === 'function') {
        log('success', '✅ Fonction switchTab() chargée');
    }
});

// Sauvegarder la configuration
function saveConfig() {
    const config = {
        apiUrl: document.getElementById('apiUrl').value,
        supabaseUrl: document.getElementById('supabaseUrl').value,
        supabaseKey: document.getElementById('supabaseKey').value,
    };
    localStorage.setItem('datafriday_config', JSON.stringify(config));
}

// Charger la configuration
function loadSavedConfig() {
    const saved = localStorage.getItem('datafriday_config');
    if (saved) {
        const config = JSON.parse(saved);
        document.getElementById('apiUrl').value = config.apiUrl || 'http://localhost:3000/api/v1';
        document.getElementById('supabaseUrl').value = config.supabaseUrl || '';
        document.getElementById('supabaseKey').value = config.supabaseKey || '';
    }
}

// Initialiser Supabase client (Singleton pattern)
function initSupabase() {
    const supabaseUrl = document.getElementById('supabaseUrl').value;
    const supabaseKey = document.getElementById('supabaseKey').value;
    
    if (!supabaseUrl || !supabaseKey) {
        log('error', '❌ Veuillez configurer Supabase URL et Key');
        return false;
    }
    
    // Si une instance existe déjà, ne pas en créer une nouvelle
    if (supabaseClient) {
        return true;
    }
    
    // Utiliser le client Supabase via CDN
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        saveConfig();
        return true;
    } else {
        log('error', '❌ Supabase client non chargé. Rechargez la page.');
        return false;
    }
}

// Tester la connexion Supabase
async function testSupabaseConnection() {
    if (!initSupabase()) {
        return;
    }
    
    try {
        log('info', '🔌 Test de connexion Supabase...');
        
        // Tester la connexion en vérifiant la session
        const { data, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            throw error;
        }
        
        log('success', '✅ Configuration Supabase validée !');
        log('success', '✅ Configuration sauvegardée localement');
        log('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Si une session existe déjà
        if (data.session) {
            currentUser = data.session.user;
            accessToken = data.session.access_token;
            updateAuthStatus(true);
            log('success', '🎉 Session existante trouvée !', data.session.user);
        } else {
            log('warning', '⚠️ ATTENTION : Configuration OK, mais vous N\'ÊTES PAS connecté(e)');
            log('warning', '');
            log('warning', '📍 PROCHAINE ÉTAPE :');
            log('warning', '   1️⃣ Descendez à la section "🔐 Authentification"');
            log('warning', '   2️⃣ Remplissez email + mot de passe');
            log('warning', '   3️⃣ Cliquez sur "Se connecter" (ou "S\'inscrire" si nouveau compte)');
            log('warning', '');
            log('warning', '➡️ Le badge "Non connecté" deviendra VERT quand vous serez authentifié');
        }
        
        log('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        log('error', '❌ Erreur connexion Supabase', error);
        log('error', '⚠️ Vérifiez que l\'URL et la Key sont corrects');
    }
}

// Logging
function log(type, message, data = null) {
    const console = document.getElementById('console');
    const entry = document.createElement('div');
    entry.className = `console-entry ${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    
    if (data) {
        const dataDiv = document.createElement('pre');
        dataDiv.textContent = JSON.stringify(data, null, 2);
        dataDiv.style.marginLeft = '20px';
        dataDiv.style.fontSize = '0.85rem';
        entry.appendChild(dataDiv);
    }
    
    console.appendChild(entry);
    console.scrollTop = console.scrollHeight;
}

function clearLogs() {
    document.getElementById('console').innerHTML = '';
    log('info', '🗑️ Logs effacés');
}

// Afficher le résultat
function showResult(elementId, data, success = true) {
    const resultDiv = document.getElementById(elementId);
    resultDiv.classList.add('show');
    
    const pre = resultDiv.querySelector('pre') || document.createElement('pre');
    pre.textContent = JSON.stringify(data, null, 2);
    
    if (!resultDiv.querySelector('pre')) {
        resultDiv.appendChild(pre);
    }
    
    resultDiv.style.borderLeftColor = success ? '#51cf66' : '#ff6b6b';
}

// Switch tabs
function switchTab(tabName, event) {
    log('info', `🔄 Changement d'onglet vers: ${tabName}`);
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const tabContent = document.getElementById(`${tabName}-tab`);
    if (tabContent) {
        tabContent.classList.add('active');
    }
    
    // Active button
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: find button by onclick attribute
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('onclick').includes(tabName)) {
                btn.classList.add('active');
            }
        });
    }
}

// ==================== AUTHENTIFICATION ====================

async function register() {
    log('info', '🚀 Fonction register() appelée');
    
    if (!initSupabase()) {
        log('error', '❌ Impossible d\'initialiser Supabase');
        return;
    }
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const firstName = document.getElementById('registerFirstName').value;
    const lastName = document.getElementById('registerLastName').value;
    
    log('info', `📋 Données: email=${email}, firstName=${firstName}, lastName=${lastName}`);
    
    if (!email || !password || !firstName || !lastName) {
        log('error', '❌ Veuillez remplir tous les champs');
        return;
    }
    
    try {
        log('info', '📝 Inscription en cours...');
        
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                }
            }
        });
        
        if (error) throw error;
        
        log('success', '✅ Inscription Supabase réussie !');
        
        // Si une session existe (pas de confirmation email requise)
        if (data.session) {
            accessToken = data.session.access_token;
            currentUser = data.session.user;
            localStorage.setItem('datafriday_token', accessToken);
            updateAuthStatus(true);
            
            log('success', '🎉 Compte créé avec succès !');
            log('info', '📝 Prochaine étape : Scrollez vers la section "Onboarding" ci-dessous');
            log('info', '👇 Remplissez vos informations d\'organisation pour continuer');
        } else {
            log('info', '📧 Vérifiez votre email pour confirmer votre compte');
            log('warning', '⚠️ Après confirmation, connectez-vous et remplissez vos informations d\'organisation');
        }
        
    } catch (error) {
        log('error', '❌ Erreur inscription', error);
        log('error', '📄 Détails:', error.message);
    }
}

async function login() {
    log('info', '🚀 Fonction login() appelée');
    
    if (!initSupabase()) {
        log('error', '❌ Impossible d\'initialiser Supabase');
        return;
    }
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    log('info', `📋 Email: ${email}`);
    
    if (!email || !password) {
        log('error', '❌ Veuillez remplir email et mot de passe');
        return;
    }
    
    try {
        log('info', '🔐 Connexion en cours...');
        
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password,
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        accessToken = data.session.access_token;
        localStorage.setItem('datafriday_token', accessToken);
        
        log('success', '✅ Connexion Supabase réussie !');
        
        // Vérifier si l'utilisateur existe dans la DB
        log('info', '🔍 Vérification du profil...');
        try {
            await apiCall('/me');
            log('success', '✅ Profil trouvé !');
            updateAuthStatus(true);
            log('success', '🎉 Vous êtes maintenant connecté(e) !');
            log('info', '👉 Vous pouvez maintenant tester les autres fonctionnalités');
        } catch (meError) {
            // User n'existe pas dans la DB, créer l'organisation
            log('warning', '⚠️ Première connexion détectée');
            log('warning', '📝 Veuillez remplir vos informations dans la section "Onboarding" ci-dessous');
            log('info', '👇 Scrollez vers le bas et cliquez sur "Créer l\'organisation"');
            updateAuthStatus(false);
        }
        
    } catch (error) {
        log('error', '❌ Erreur connexion', error);
        log('error', '📄 Détails:', error.message);
    }
}

async function logout() {
    if (!supabaseClient) {
        log('error', '❌ Client Supabase non initialisé');
        return;
    }
    
    try {
        await supabaseClient.auth.signOut();
        
        // Réinitialiser tout
        currentUser = null;
        accessToken = null;
        supabaseClient = null; // Détruire l'instance pour permettre une nouvelle connexion
        
        updateAuthStatus(false);
        localStorage.removeItem('datafriday_token');
        
        log('info', '👋 Déconnexion réussie');
        log('info', 'ℹ️ Vous pouvez vous reconnecter avec un autre compte si nécessaire');
    } catch (error) {
        log('error', '❌ Erreur déconnexion', error);
    }
}

async function checkAuthStatus() {
    const token = localStorage.getItem('datafriday_token');
    if (token) {
        accessToken = token;
        updateAuthStatus(true);
        log('info', '🔑 Token trouvé dans le cache');
    }
    
    // Essayer de restaurer la session Supabase (utiliser initSupabase pour éviter les doublons)
    const supabaseUrl = document.getElementById('supabaseUrl').value;
    const supabaseKey = document.getElementById('supabaseKey').value;
    
    if (supabaseUrl && supabaseKey && window.supabase && !supabaseClient) {
        try {
            // Utiliser initSupabase au lieu de créer directement
            if (initSupabase()) {
                const { data } = await supabaseClient.auth.getSession();
                
                if (data.session) {
                    currentUser = data.session.user;
                    accessToken = data.session.access_token;
                    updateAuthStatus(true);
                    log('success', '✅ Session Supabase restaurée');
                }
            }
        } catch (error) {
            // Ignore errors on startup
        }
    }
}

function updateAuthStatus(connected) {
    const statusDiv = document.getElementById('authStatus');
    const badge = statusDiv.querySelector('.status-badge');
    const userInfo = document.getElementById('userInfo');
    
    if (connected) {
        badge.textContent = 'Connecté';
        badge.className = 'status-badge status-connected';
        userInfo.textContent = currentUser ? `${currentUser.email}` : 'Utilisateur connecté';
    } else {
        badge.textContent = 'Non connecté';
        badge.className = 'status-badge status-disconnected';
        userInfo.textContent = '';
    }
}

// ==================== API CALLS ====================

async function apiCall(endpoint, method = 'GET', body = null, requireAuth = true) {
    const apiUrl = document.getElementById('apiUrl').value;
    const url = `${apiUrl}${endpoint}`;
    
    const headers = {
        'Content-Type': 'application/json',
    };
    
    if (requireAuth) {
        if (!accessToken) {
            log('error', '❌ Token non disponible. Connectez-vous d\'abord.');
            throw new Error('Not authenticated');
        }
        headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    const options = {
        method,
        headers,
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    log('info', `📡 ${method} ${endpoint}`);
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message || 'API Error');
    }
    
    return data;
}

// ==================== ENDPOINTS ====================

async function getMe() {
    try {
        const data = await apiCall('/me');
        log('success', '✅ Profil récupéré', data);
        showResult('meResult', data);
        
        // Auto-remplir le tenant ID
        if (data.tenant?.id) {
            document.getElementById('tenantId').value = data.tenant.id;
        }
    } catch (error) {
        log('error', '❌ Erreur /me', error);
        showResult('meResult', { error: error.message }, false);
    }
}

async function createTenant() {
    // Récupérer tous les champs obligatoires
    const firstName = document.getElementById('onboardingFirstName').value;
    const lastName = document.getElementById('onboardingLastName').value;
    const organizationName = document.getElementById('tenantName').value;
    const organizationType = document.getElementById('tenantType').value;
    const organizationEmail = document.getElementById('tenantEmail').value;
    const organizationPhone = document.getElementById('tenantPhone').value;
    
    // Validation des champs obligatoires
    if (!firstName || !lastName || !organizationName || !organizationType || !organizationEmail || !organizationPhone) {
        log('error', '❌ Veuillez remplir tous les champs obligatoires (marqués avec *)');
        return;
    }
    
    // Récupérer les champs optionnels
    const siret = document.getElementById('tenantSiret').value || undefined;
    const address = document.getElementById('tenantAddress').value || undefined;
    const city = document.getElementById('tenantCity').value || undefined;
    const postalCode = document.getElementById('tenantPostalCode').value || undefined;
    const country = document.getElementById('tenantCountry').value || 'France';
    const numberOfEmployees = document.getElementById('tenantEmployees').value ? parseInt(document.getElementById('tenantEmployees').value) : undefined;
    const numberOfSpaces = document.getElementById('tenantSpaces').value ? parseInt(document.getElementById('tenantSpaces').value) : undefined;
    const paymentMethod = document.getElementById('tenantPayment').value || undefined;
    
    try {
        log('info', '🏢 Création de votre organisation...');
        
        const payload = {
            firstName,
            lastName,
            organizationName,
            organizationType,
            organizationEmail,
            organizationPhone,
            siret,
            address,
            city,
            postalCode,
            country,
            numberOfEmployees,
            numberOfSpaces,
            paymentMethod
        };
        
        // Supprimer les champs undefined
        Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
        
        log('info', '📤 Envoi des données...', payload);
        
        const data = await apiCall('/onboarding', 'POST', payload);
        
        log('success', '✅ Organisation créée avec succès !', data);
        showResult('onboardingResult', data);
        
        // Auto-remplir le tenant ID
        if (data.tenant?.id) {
            document.getElementById('tenantId').value = data.tenant.id;
        }
        
        // Rafraîchir le profil pour voir les nouvelles infos
        log('info', '🔄 Rafraîchissement de votre profil...');
        await getMe();
        
    } catch (error) {
        log('error', '❌ Erreur création organisation', error);
        showResult('onboardingResult', { error: error.message }, false);
    }
}

async function configureWeezevent() {
    const tenantId = document.getElementById('tenantId').value;
    const clientId = document.getElementById('weezeventClientId').value;
    const clientSecret = document.getElementById('weezeventClientSecret').value;
    const orgId = document.getElementById('weezeventOrgId').value;
    
    if (!tenantId || !clientId || !clientSecret || !orgId) {
        log('error', '❌ Veuillez remplir tous les champs');
        return;
    }
    
    try {
        const data = await apiCall(`/organizations/${tenantId}/integrations/weezevent`, 'PATCH', {
            weezeventClientId: clientId,
            weezeventClientSecret: clientSecret,
            weezeventOrganizationId: orgId,
            weezeventEnabled: true,
        });
        
        log('success', '✅ Weezevent configuré', data);
        showResult('weezeventConfigResult', data);
    } catch (error) {
        log('error', '❌ Erreur config Weezevent', error);
        showResult('weezeventConfigResult', { error: error.message }, false);
    }
}

async function getWeezeventConfig() {
    const tenantId = document.getElementById('tenantId').value;
    
    if (!tenantId) {
        log('error', '❌ Veuillez renseigner le Tenant ID');
        return;
    }
    
    try {
        const data = await apiCall(`/organizations/${tenantId}/integrations/weezevent`);
        log('success', '✅ Configuration récupérée', data);
        showResult('weezeventConfigResult', data);
    } catch (error) {
        log('error', '❌ Erreur récupération config', error);
        showResult('weezeventConfigResult', { error: error.message }, false);
    }
}

async function syncWeezevent(type) {
    try {
        const body = { type };
        
        if (type === 'transactions') {
            body.fromDate = '2024-01-01';
            body.full = false;
        }
        
        log('info', `🔄 Synchronisation ${type} en cours...`);
        const data = await apiCall('/weezevent/sync', 'POST', body);
        
        log('success', `✅ Sync ${type} terminée`, data);
        showResult('syncResult', data);
    } catch (error) {
        log('error', `❌ Erreur sync ${type}`, error);
        showResult('syncResult', { error: error.message }, false);
    }
}

async function getSyncStatus() {
    try {
        const data = await apiCall('/weezevent/sync/status');
        log('success', '✅ Status récupéré', data);
        showResult('syncResult', data);
    } catch (error) {
        log('error', '❌ Erreur status', error);
        showResult('syncResult', { error: error.message }, false);
    }
}

async function getWeezeventData(type) {
    try {
        const data = await apiCall(`/weezevent/${type}?page=1&perPage=10`);
        log('success', `✅ ${type} récupérés`, data);
        showResult('weezeventDataResult', data);
    } catch (error) {
        log('error', `❌ Erreur récupération ${type}`, error);
        showResult('weezeventDataResult', { error: error.message }, false);
    }
}

async function healthCheck() {
    try {
        const data = await apiCall('/health', 'GET', null, false);
        log('success', '✅ API opérationnelle', data);
        showResult('healthResult', data);
    } catch (error) {
        log('error', '❌ API non disponible', error);
        showResult('healthResult', { error: error.message }, false);
    }
}
