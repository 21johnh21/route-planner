// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// Sidebar functionality
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const loginBtn = document.getElementById("loginBtn");
const loginModal = document.getElementById("loginModal");
const loginForm = document.getElementById("loginForm");
const cancelBtn = document.getElementById("cancelBtn");
const profileIcon = document.getElementById("profileIcon");
const profileInfo = document.getElementById("profileInfo");
const toggleAuthBtn = document.getElementById("toggleAuthBtn");
const modalTitle = document.getElementById("modalTitle");
const submitBtn = document.getElementById("submitBtn");
const toggleText = document.getElementById("toggleText");
const confirmPasswordGroup = document.getElementById("confirmPasswordGroup");

let isLoggedIn = false;
let currentUser = null;
let authToken = null;
let isSignUpMode = false;

// Check for existing auth token on page load
function initAuth() {
  try {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    
    if (token && userData) {
      authToken = token;
      currentUser = JSON.parse(userData);
      isLoggedIn = true;
      updateProfileUI();
    }
  } catch (error) {
    console.warn('Could not access localStorage:', error);
    // Clear any partial data
    clearStorage();
  }
}

// Toggle sidebar
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// Close sidebar when clicking outside
document.addEventListener("click", (e) => {
  if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target) && sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
  }
});

// Open login modal
loginBtn.addEventListener("click", () => {
  loginModal.classList.add("active");
});

profileIcon.addEventListener("click", () => {
  if (!isLoggedIn) {
    loginModal.classList.add("active");
  }
});

// Close login modal
cancelBtn.addEventListener("click", () => {
  loginModal.classList.remove("active");
  resetAuthForm();
});

loginModal.addEventListener("click", (e) => {
  if (e.target === loginModal) {
    loginModal.classList.remove("active");
    resetAuthForm();
  }
});

// Toggle between login and signup
toggleAuthBtn.addEventListener("click", () => {
  isSignUpMode = !isSignUpMode;
  if (isSignUpMode) {
    modalTitle.textContent = "Create Account";
    submitBtn.textContent = "Create Account";
    toggleText.textContent = "Already have an account?";
    toggleAuthBtn.textContent = "Log In";
    confirmPasswordGroup.style.display = "block";
    document.getElementById("confirmPasswordInput").required = true;
  } else {
    modalTitle.textContent = "Log In";
    submitBtn.textContent = "Log In";
    toggleText.textContent = "Don't have an account?";
    toggleAuthBtn.textContent = "Create Account";
    confirmPasswordGroup.style.display = "none";
    document.getElementById("confirmPasswordInput").required = false;
  }
});

// Social login buttons (placeholder - implement OAuth flows later)
document.querySelector(".google-btn").addEventListener("click", () => {
  alert("Google Sign-In coming soon! Please use email/password for now.");
});

document.querySelector(".apple-btn").addEventListener("click", () => {
  alert("Apple Sign-In coming soon! Please use email/password for now.");
});

// Handle login/signup
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  const confirmPassword = document.getElementById("confirmPasswordInput").value;

  // Disable submit button during request
  submitBtn.disabled = true;
  submitBtn.textContent = isSignUpMode ? "Creating Account..." : "Logging In...";

  try {
    if (isSignUpMode) {
      // Validate passwords match
      if (password !== confirmPassword) {
        showError("Passwords do not match!");
        return;
      }
      
      // Sign Up
      await signUp(email, password);
    } else {
      // Login
      await login(email, password);
    }
  } catch (error) {
    console.error("Auth error:", error);
  } finally {
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = isSignUpMode ? "Create Account" : "Log In";
  }
});

// Sign Up API call
async function signUp(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Sign up failed');
    }

    showSuccess("Account created successfully! Please log in.");
    
    // Switch to login mode
    isSignUpMode = false;
    modalTitle.textContent = "Log In";
    submitBtn.textContent = "Log In";
    toggleText.textContent = "Don't have an account?";
    toggleAuthBtn.textContent = "Create Account";
    confirmPasswordGroup.style.display = "none";
    document.getElementById("confirmPasswordInput").required = false;
    
    // Clear password fields
    document.getElementById("passwordInput").value = "";
    document.getElementById("confirmPasswordInput").value = "";
  } catch (error) {
    showError(error.message || 'Sign up failed. Please try again.');
    throw error;
  }
}

// Login API call
async function login(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Store token and user data
    authToken = data.token;
    
    // Extract user info from email
    const name = email.split("@")[0];
    currentUser = { name, email };
    
    // Try to store in localStorage, but continue even if it fails
    try {
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('userData', JSON.stringify(currentUser));
    } catch (storageError) {
      console.warn('Could not save to localStorage:', storageError);
      // Authentication still works, just won't persist across page reloads
    }
    
    isLoggedIn = true;
    
    updateProfileUI();
    loginModal.classList.remove("active");
    resetAuthForm();
    
    showSuccess("Logged in successfully!");
  } catch (error) {
    showError(error.message || 'Invalid email or password.');
    throw error;
  }
}

// Reset form to login mode
function resetAuthForm() {
  loginForm.reset();
  isSignUpMode = false;
  modalTitle.textContent = "Log In";
  submitBtn.textContent = "Log In";
  toggleText.textContent = "Don't have an account?";
  toggleAuthBtn.textContent = "Create Account";
  confirmPasswordGroup.style.display = "none";
  document.getElementById("confirmPasswordInput").required = false;
  submitBtn.disabled = false;
}

// Update profile UI
function updateProfileUI() {
  if (isLoggedIn && currentUser) {
    profileInfo.className = "profile-info logged-in";
    profileInfo.innerHTML = `
      <div class="username">${currentUser.name}</div>
      <div class="email">${currentUser.email}</div>
      <button class="logout-btn" id="logoutBtn">Log Out</button>
    `;
    
    document.getElementById("logoutBtn").addEventListener("click", logout);
  } else {
    profileInfo.className = "profile-info logged-out";
    profileInfo.innerHTML = `
      <div>Not logged in</div>
      <button class="login-btn" id="loginBtn">Log In</button>
    `;
    
    document.getElementById("loginBtn").addEventListener("click", () => {
      loginModal.classList.add("active");
    });
  }
}

// Logout
function logout() {
  isLoggedIn = false;
  currentUser = null;
  authToken = null;
  
  // Clear stored data
  clearStorage();
  
  updateProfileUI();
  showSuccess("Logged out successfully!");
}

// Helper to safely clear storage
function clearStorage() {
  try {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
  } catch (error) {
    console.warn('Could not clear localStorage:', error);
  }
}

// Helper function to show error messages
function showError(message) {
  // You can replace this with a nicer toast/notification system
  alert(message);
}

// Helper function to show success messages
function showSuccess(message) {
  // You can replace this with a nicer toast/notification system
  console.log(message);
}

// Export auth utilities for use in other modules
export function getAuthToken() {
  return authToken;
}

export function isAuthenticated() {
  return isLoggedIn;
}

export function getCurrentUser() {
  return currentUser;
}

// Initialize auth on page load
initAuth();