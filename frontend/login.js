// ─── Authentication Logic ──────────────────────────────────────────────────────

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const alertBox = document.getElementById('authAlert');

// Toggle between Login and Register views
function toggleAuth(type) {
    alertBox.className = '';
    alertBox.style.display = 'none';

    if (type === 'register') {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
        authTitle.innerText = 'Create an Account';
        authSubtitle.innerText = 'Join ParkIQ to start reserving spots instantly.';
    } else {
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
        authTitle.innerText = 'Welcome Back';
        authSubtitle.innerText = 'Enter your credentials to access your account.';
    }
}

// Display alert messages
function showAlert(message, type) {
    alertBox.innerText = message;
    alertBox.className = type;
}

// Handle Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    
    btn.innerHTML = 'Logging in...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Login failed');

        // Store standard web token securely in local storage
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        showAlert('Login successful! Redirecting...', 'success');
        
        // Return to map or explicit redirect query params
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect') || 'map.html';
        
        setTimeout(() => window.location.href = redirect, 1000);

    } catch (err) {
        showAlert(err.message, 'error');
        btn.innerHTML = 'Log In';
        btn.disabled = false;
    }
});

// Handle Registration
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const vehicle_type = document.getElementById('regVehicle').value;
    const btn = document.getElementById('registerBtn');

    btn.innerHTML = 'Creating account...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, vehicle_type })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Registration failed');

        showAlert('Account created! Please log in.', 'success');
        setTimeout(() => toggleAuth('login'), 1500);

    } catch (err) {
        showAlert(err.message, 'error');
    } finally {
        btn.innerHTML = 'Create Account';
        btn.disabled = false;
    }
});
