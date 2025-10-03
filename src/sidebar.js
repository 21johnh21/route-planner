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
let isSignUpMode = false;

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

// Social login buttons
document.querySelector(".google-btn").addEventListener("click", () => {
  const email = "user@gmail.com";
  const name = "Google User";
  currentUser = { name, email };
  isLoggedIn = true;
  updateProfileUI();
  loginModal.classList.remove("active");
  resetAuthForm();
});

document.querySelector(".apple-btn").addEventListener("click", () => {
  const email = "user@icloud.com";
  const name = "Apple User";
  currentUser = { name, email };
  isLoggedIn = true;
  updateProfileUI();
  loginModal.classList.remove("active");
  resetAuthForm();
});

// Handle login/signup
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  const confirmPassword = document.getElementById("confirmPasswordInput").value;

  if (isSignUpMode && password !== confirmPassword) {
    alert("Passwords do not match!");
    return;
  }

  const name = email.split("@")[0];
  
  currentUser = { name, email };
  isLoggedIn = true;
  
  updateProfileUI();
  loginModal.classList.remove("active");
  resetAuthForm();
});

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
  updateProfileUI();
}