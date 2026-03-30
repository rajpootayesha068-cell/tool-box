// ==================================================
// GLOBAL INITIALIZATION
// ==================================================
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    createParticles();
    initializeScrollAnimations();
    initializeHeaderScroll();
    initializeCarousel();
    initializeFAQ();
    initializeCounters();
    setActiveNavLink();
    initializeUIExtras();
    initializeAuthForms();
    updateTimer();
    console.log('✅ JavaScript loaded successfully');
});

// ==================================================
// THEME / DARK MODE
// ==================================================
function toggleDarkMode(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcons(newTheme);
}

function updateThemeIcons(theme) {
    document.querySelectorAll('.toggle-indicator i, .toggle-icon')
        .forEach(icon => {
            icon.className = theme === 'dark'
                ? 'fas fa-toggle-on'
                : 'fas fa-toggle-off';
        });

    document.querySelectorAll('.theme-toggle i:first-child, .theme-toggle-btn i:first-child')
        .forEach(icon => {
            icon.className = theme === 'dark'
                ? 'fas fa-sun'
                : 'fas fa-moon';
        });
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcons(savedTheme);
}

// ==================================================
// MENUS (PROFILE / TOOLKIT / MOBILE)
// ==================================================
function toggleProfileMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('profileMenu')?.classList.toggle('show');
}

function toggleToolkitMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('toolkitMenu')?.classList.toggle('show');
}

function toggleMobileMenu() {
    const nav = document.getElementById('mobileNav');
    if (!nav) return;

    nav.classList.toggle('show');
    document.body.style.overflow = nav.classList.contains('show') ? 'hidden' : '';
}

// Close menus on outside click
document.addEventListener('click', e => {
    const menus = [
        { menu: 'profileMenu', trigger: '.profile-icon-container' },
        { menu: 'toolkitMenu', trigger: '.toolkit-trigger' }
    ];

    menus.forEach(({ menu, trigger }) => {
        const m = document.getElementById(menu);
        const t = document.querySelector(trigger);
        if (m && t && !m.contains(e.target) && !t.contains(e.target)) {
            m.classList.remove('show');
        }
    });
});

// Close menus with ESC
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        ['profileMenu', 'toolkitMenu', 'mobileNav']
            .forEach(id => document.getElementById(id)?.classList.remove('show'));
        document.body.style.overflow = '';
    }
});

// ==================================================
// HEADER SCROLL EFFECT
// ==================================================
function initializeHeaderScroll() {
    const header = document.getElementById('mainHeader');
    if (!header) return;

    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const current = window.scrollY;
        header.classList.toggle('scroll-down', current > lastScroll && current > 0);
        header.classList.toggle('scroll-up', current < lastScroll);
        lastScroll = current;
    });
}

// ==================================================
// ACTIVE NAV LINK
// ==================================================
function setActiveNavLink() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === page);
    });
}

// ==================================================
// SCROLL ANIMATIONS
// ==================================================
function initializeScrollAnimations() {
    const items = document.querySelectorAll('.animate-on-scroll');
    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => e.isIntersecting && e.target.classList.add('animate-in'));
    }, { threshold: 0.2 });

    items.forEach(el => observer.observe(el));
}

// ==================================================
// FAQ ACCORDION
// ==================================================
function initializeFAQ() {
    document.querySelectorAll('.faq-item').forEach(item => {
        item.querySelector('.faq-question')?.addEventListener('click', () => {
            document.querySelectorAll('.faq-item')
                .forEach(i => i !== item && i.classList.remove('active'));
            item.classList.toggle('active');
        });
    });
}

// ==================================================
// COUNTERS
// ==================================================
function initializeCounters() {
    document.querySelectorAll('.stat-number[data-count]').forEach(counter => {
        const target = +counter.dataset.count;
        let current = 0;

        const interval = setInterval(() => {
            current += target / 50;
            counter.textContent = Math.floor(current);
            if (current >= target) {
                counter.textContent = target;
                clearInterval(interval);
            }
        }, 30);
    });
}

// ==================================================
// CAROUSEL (LOGIC UNCHANGED)
// ==================================================
function initializeCarousel() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    // Your original carousel logic stays here
}

// ==================================================
// PARTICLES BACKGROUND
// ==================================================
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.width = p.style.height = Math.random() * 3 + 1 + 'px';
        p.style.animation = `floatParticle ${Math.random() * 20 + 10}s linear infinite`;
        container.appendChild(p);
    }
} 

// ==================================================
// AUTH (LOGIN / SIGNUP)
// ==================================================
function initializeAuthForms() {
    document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
}

function handleSignup(e) {
    e.preventDefault();
    showNotification('Account created successfully!', 'success');
    setTimeout(() => window.location.href = 'login.html', 1500);
}

function handleLogin(e) {
    e.preventDefault();
    showNotification('Login successful!', 'success');
    setTimeout(() => window.location.href = 'index.html', 1500);
}

// ==================================================
// NOTIFICATIONS
// ==================================================
function showNotification(message, type = 'success') {
    const old = document.querySelector('.auth-notification');
    if (old) old.remove();

    const n = document.createElement('div');
    n.className = 'auth-notification';
    n.textContent = message;
    n.style.cssText = `
        position: fixed;
        top: 90px;
        right: 20px;
        background: #0066ff;
        color: white;
        padding: 1rem 2rem;
        border-radius: 30px;
        z-index: 9999;
    `;
    document.body.appendChild(n);

    setTimeout(() => n.remove(), 3000);
}

// ==================================================
// COUNTDOWN TIMER
// ==================================================
function updateTimer() {
    const target = new Date();
    target.setDate(target.getDate() + 3);

    setInterval(() => {
        const diff = target - new Date();
        if (diff <= 0) return;

        days.textContent = Math.floor(diff / 86400000).toString().padStart(2, '0');
        hours.textContent = Math.floor(diff / 3600000 % 24).toString().padStart(2, '0');
        minutes.textContent = Math.floor(diff / 60000 % 60).toString().padStart(2, '0');
        seconds.textContent = Math.floor(diff / 1000 % 60).toString().padStart(2, '0');
    }, 1000);
}

// ==================================================
// UI EXTRAS (CARDS, SCROLL TOP, EFFECTS)
// ==================================================
function initializeUIExtras() {
    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('mouseenter', () => card.style.zIndex = '10');
        card.addEventListener('mouseleave', () => card.style.zIndex = '1');
    });
}
// background.js
(function () {
  const orbs = document.querySelectorAll(".glow-orb");

  if (!orbs.length) return;

  function moveOrb(orb) {
    const x = Math.random() * 60 - 30; // -30px to +30px
    const y = Math.random() * 60 - 30;
    const scale = 1 + Math.random() * 0.15;
    orb.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  // initial move
  orbs.forEach(moveOrb);

  // keep moving slowly
  setInterval(() => {
    orbs.forEach(moveOrb);
  }, 6000);
})();