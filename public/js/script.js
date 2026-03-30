// ========================================
// MASTER JAVASCRIPT FILE - MiniToolBox
// ========================================

// ===== IMPORTS FROM FIREBASE CONFIG =====
import { auth, db, storage, googleProvider } from '../firebase-config.js';

// ===== FIREBASE FUNCTIONS (v10 modular SDK) =====
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    sendPasswordResetEmail,
    updateProfile,
    signOut,
    onAuthStateChanged,
    updatePassword,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
    EmailAuthProvider,
    GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ========================================
// ========== GLOBAL VARIABLES ==========
// ========================================
window.days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let currentUser = null;
let userData = null;
let userCollection = null;
let currentUserType = 'free';

// ========================================
// ========== API BASE URL (Vercel safe) ==========
// FIX: No more localhost hardcoding — set your deployed backend URL below.
// Set VITE_API_BASE (or equivalent) in your Vercel environment variables,
// OR replace the fallback string with your actual backend URL.
// ========================================
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
    ? import.meta.env.VITE_API_BASE
    : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://your-backend.vercel.app');

const PARAPHRASE_API_URL = `${API_BASE}/paraphrase`;
const PLAGIARISM_API_URL = `${API_BASE}/plagiarism`;

// ========================================
// ========== DATABASE FUNCTIONS ==========
// FIX: Merged users into ONE collection "users" with authMethod field.
// This avoids the double-collection lookup everywhere and prevents
// duplicate profiles when same email is used with Google + email auth.
// ========================================

async function saveUserToDatabase(uid, data) {
    try {
        await setDoc(doc(db, "users", uid), data, { merge: true });
        console.log("✅ User saved to 'users' collection");
        return true;
    } catch (error) {
        console.error('❌ Firestore Save Error:', error);
        return null;
    }
}

async function getUserFromDatabase(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
        console.error('❌ Firestore Get Error:', error);
        return null;
    }
}

// FIX: increment is a function that must be called as increment(1)
async function recordLoginActivity(uid) {
    try {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, {
            lastLogin: new Date().toISOString(),
            loginCount: increment(1)   // ← was: increment (bug — function ref, not call)
        });
        console.log(`✅ Login activity recorded`);
    } catch (error) {
        console.log('Error recording login:', error);
    }
}

// ========================================
// ========== AUTH FUNCTIONS ==========
// ========================================

function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input || !button) return;
    const icon = button.querySelector('i');
    if (!icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

async function handleForgotPassword(email) {
    if (!email) {
        showNotification('Please enter your email address', 'error');
        return false;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showNotification('Password reset email sent! Check your inbox.', 'success');
        return true;
    } catch (error) {
        console.error('Password reset error:', error);
        switch (error.code) {
            case 'auth/user-not-found':
                showNotification('No account found with this email address.', 'error');
                break;
            case 'auth/invalid-email':
                showNotification('Please enter a valid email address.', 'error');
                break;
            default:
                showNotification('Failed to send reset email. Please try again.', 'error');
        }
        return false;
    }
}

async function handleSignup(event) {
    event.preventDefault();

    const fullName = document.getElementById('fullName')?.value;
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    const terms = document.getElementById('terms')?.checked;
    const btn = document.getElementById('signupBtn');
    const errorDiv = document.getElementById('signupError');
    const successDiv = document.getElementById('signupSuccess');

    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';

    if (!fullName || !email || !password || !confirmPassword) {
        showError(errorDiv, 'Please fill in all fields');
        return;
    }
    if (password !== confirmPassword) {
        showError(errorDiv, 'Passwords do not match');
        return;
    }
    if (!terms) {
        showError(errorDiv, 'Please agree to the terms');
        return;
    }

    setLoading(btn, true);

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: fullName });

        await saveUserToDatabase(user.uid, {
            fullName,
            email,
            plan: 'free',
            authMethod: 'email',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            loginCount: 1,
            emailVerified: false,
            uid: user.uid
        });

        showSuccess(successDiv, 'Account created! Redirecting...');
        setTimeout(() => { window.location.href = 'login.html'; }, 2000);

    } catch (error) {
        console.error(error);
        let errorMessage = error.message;
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please login instead.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters.';
        }
        showError(errorDiv, errorMessage);
    } finally {
        setLoading(btn, false);
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;
    const btn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');
    const successDiv = document.getElementById('loginSuccess');

    if (errorDiv) errorDiv.style.display = 'none';
    if (!email || !password) {
        showError(errorDiv, 'Please enter email and password');
        return;
    }

    setLoading(btn, true);

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // FIX: renamed to fetchedData to avoid shadowing the global `userData`
        const fetchedData = await getUserFromDatabase(user.uid);
        await recordLoginActivity(user.uid);

        localStorage.setItem('user', JSON.stringify({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            plan: fetchedData?.plan || 'free',   // ← was always 'free' for no reason
            authMethod: 'email'
        }));

        showSuccess(successDiv, 'Login successful!');
        window.location.href = 'profile.html';

    } catch (error) {
        console.error(error);
        let errorMessage = 'Invalid email or password.';
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed attempts. Try again later.';
        }
        showError(errorDiv, errorMessage);
    } finally {
        setLoading(btn, false);
    }
}

// ========================================
// ========== GOOGLE LOGIN ==========
// ========================================
async function handleGoogleLogin() {
    const btn = document.querySelector('.google-btn');
    setGoogleLoading(btn, true);

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        console.log("✅ Google Sign-In successful:", user.email);

        let existingData = await getUserFromDatabase(user.uid);

        if (!existingData) {
            // New Google user — create profile
            existingData = {
                fullName: user.displayName || 'Google User',
                firstName: user.displayName?.split(' ')[0] || '',
                lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
                email: user.email,
                photoURL: user.photoURL || null,
                plan: 'free',
                authMethod: 'google',
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                emailVerified: user.emailVerified,
                loginCount: 1,
                uid: user.uid
            };
            await saveUserToDatabase(user.uid, existingData);
            console.log("✅ New Google user created");
        } else {
            await recordLoginActivity(user.uid);
            console.log("✅ Existing Google user login recorded");
        }

        // FIX: plan now reads from Firestore, not hardcoded 'free'
        localStorage.setItem('user', JSON.stringify({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            plan: existingData?.plan || 'free',
            authMethod: 'google'
        }));

        if (user.photoURL) updateProfilePicture(user.photoURL);

        showNotification('Google Login Successful!', 'success');
        setTimeout(() => { window.location.href = 'profile.html'; }, 1000);

    } catch (error) {
        console.error('❌ Google Sign-In Error:', error);
        let errorMessage = 'Google login failed.';
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Sign-in cancelled. Please try again.';
        } else if (error.code === 'auth/popup-blocked') {
            errorMessage = 'Pop-up blocked. Please allow pop-ups for this site.';
        } else if (error.code === 'auth/unauthorized-domain') {
            errorMessage = 'This domain is not authorized. Add it in Firebase Console → Auth → Authorized Domains.';
        } else {
            errorMessage += ' ' + error.message;
        }
        showNotification(errorMessage, 'error');
    } finally {
        setGoogleLoading(btn, false);
    }
}

// ========================================
// ========== PROFILE PICTURE ==========
// ========================================
function updateProfilePicture(photoURL) {
    if (!photoURL) return;

    const avatarCircle = document.querySelector('.avatar-circle');
    if (avatarCircle) {
        const existingImg = avatarCircle.querySelector('img');
        if (existingImg) {
            existingImg.src = photoURL;
        } else {
            avatarCircle.innerHTML = '';
            const img = document.createElement('img');
            img.src = photoURL;
            img.alt = 'Profile';
            img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
            avatarCircle.appendChild(img);
        }
    }

    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) profileAvatar.src = photoURL;

    const mobileAvatarIcon = document.querySelector('.mobile-nav-avatar i');
    const mobileAvatarImg = document.querySelector('.mobile-nav-avatar img');
    if (mobileAvatarIcon) {
        const parent = mobileAvatarIcon.parentNode;
        const img = document.createElement('img');
        img.src = photoURL;
        img.alt = 'Profile';
        img.style.cssText = 'width:40px;height:40px;border-radius:50%;object-fit:cover;';
        parent.replaceChild(img, mobileAvatarIcon);
    } else if (mobileAvatarImg) {
        mobileAvatarImg.src = photoURL;
    }

    const userBoxImg = document.querySelector('.user-box img');
    if (userBoxImg && userBoxImg.id !== 'profileAvatar') {
        userBoxImg.src = photoURL;
    }
}

// ========================================
// ========== DYNAMIC DROPDOWN MENU ==========
// ========================================
function updateDynamicMenu(user) {
    const dynamicMenu = document.getElementById('dynamicProfileMenu');
    const dynamicMobileMenu = document.getElementById('dynamicMobileMenu');
    if (!dynamicMenu || !dynamicMobileMenu) return;

    if (user) {
        dynamicMenu.innerHTML = `
            <a href="profile.html" class="profile-menu-item"><i class="fas fa-user"></i><span>Profile</span></a>
            <a href="index.html" class="profile-menu-item"><i class="fas fa-chart-bar"></i><span>Dashboard</span></a>
            <button onclick="handleLogout()" class="profile-menu-item"><i class="fas fa-sign-out-alt"></i><span>Logout</span></button>
        `;
        dynamicMobileMenu.innerHTML = `
            <a href="profile.html" class="mobile-nav-link"><i class="fas fa-user"></i><span>Profile</span></a>
            <a href="index.html" class="mobile-nav-link"><i class="fas fa-chart-bar"></i><span>Dashboard</span></a>
            <button onclick="handleLogout()" class="mobile-nav-link"><i class="fas fa-sign-out-alt"></i><span>Logout</span></button>
        `;
        if (user.photoURL) updateProfilePicture(user.photoURL);
        const menuName = document.getElementById('profileMenuName');
        if (menuName) menuName.textContent = user.displayName || 'User';
        const mobileTitle = document.getElementById('mobileNavTitle');
        if (mobileTitle) mobileTitle.textContent = user.displayName || 'User';
    } else {
        dynamicMenu.innerHTML = `
            <a href="login.html" class="profile-menu-item"><i class="fas fa-sign-in-alt"></i><span>Login</span></a>
            <a href="signup.html" class="profile-menu-item"><i class="fas fa-user-plus"></i><span>Sign Up</span></a>
        `;
        dynamicMobileMenu.innerHTML = `
            <a href="login.html" class="mobile-nav-link"><i class="fas fa-sign-in-alt"></i><span>Login</span></a>
            <a href="signup.html" class="mobile-nav-link"><i class="fas fa-user-plus"></i><span>Sign Up</span></a>
        `;
        const avatarCircle = document.querySelector('.avatar-circle');
        if (avatarCircle) avatarCircle.innerHTML = '<i class="fas fa-user"></i>';
        const menuName = document.getElementById('profileMenuName');
        if (menuName) menuName.textContent = 'Account';
        const mobileTitle = document.getElementById('mobileNavTitle');
        if (mobileTitle) mobileTitle.textContent = 'Menu';
    }
}

// ========================================
// ========== DROPDOWN TOGGLES ==========
// ========================================
window.toggleProfileMenu = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    document.getElementById('profileMenu')?.classList.toggle('show');
};

window.toggleToolkitMenu = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    document.getElementById('toolkitMenu')?.classList.toggle('show');
};

window.toggleMobileMenu = function() {
    const nav = document.getElementById('mobileNav');
    if (nav) {
        nav.classList.toggle('show');
        document.body.style.overflow = nav.classList.contains('show') ? 'hidden' : '';
    }
};

// FIX: Use addEventListener instead of window.onclick to avoid overwriting other handlers
document.addEventListener('click', function(e) {
    const profileMenu = document.getElementById('profileMenu');
    const profileBtn = document.querySelector('.profile-icon-container');
    if (profileMenu && profileBtn && !profileMenu.contains(e.target) && !profileBtn.contains(e.target)) {
        profileMenu.classList.remove('show');
    }
    const toolkitMenu = document.getElementById('toolkitMenu');
    const toolkitBtn = document.querySelector('.toolkit-trigger');
    if (toolkitMenu && toolkitBtn && !toolkitMenu.contains(e.target) && !toolkitBtn.contains(e.target)) {
        toolkitMenu.classList.remove('show');
    }
    // Modal close on outside click
    const modal = document.getElementById('premiumModal');
    if (modal && e.target === modal) closeModal();
});

// ========================================
// ========== LOGOUT ==========
// ========================================
window.handleLogout = async function() {
    try {
        await signOut(auth);
        localStorage.removeItem('user');
        updateDynamicMenu(null);
        const avatarCircle = document.querySelector('.avatar-circle');
        if (avatarCircle) avatarCircle.innerHTML = '<i class="fas fa-user"></i>';
        window.location.href = 'index.html';
    } catch (error) {
        console.error('❌ Logout error:', error);
        showNotification('Logout failed: ' + error.message, 'error');
    }
};

// ========================================
// ========== FORGOT PASSWORD HANDLER ==========
// ========================================
function setupForgotPasswordHandler() {
    const forgotLink = document.getElementById('forgotPassword');
    if (!forgotLink) return;
    forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('email');
        const email = emailInput ? emailInput.value : '';
        if (email) {
            const confirmed = confirm(`Send password reset email to ${email}?`);
            if (confirmed) await handleForgotPassword(email);
        } else {
            const emailPrompt = prompt('Please enter your email address to reset password:');
            if (emailPrompt) await handleForgotPassword(emailPrompt);
        }
    });
}

// ========================================
// ========== PROFILE FUNCTIONS ==========
// ========================================

async function loadUserProfile() {
    try {
        showLoading(true);

        // FIX: single collection lookup now
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));

        if (userDoc.exists()) {
            userData = userDoc.data();
            userCollection = 'users';
        } else {
            userData = {
                fullName: currentUser.displayName || 'User',
                email: currentUser.email,
                plan: 'free',
                createdAt: new Date().toISOString(),
                authMethod: 'email',
                uid: currentUser.uid
            };
            await setDoc(doc(db, "users", currentUser.uid), userData);
            userCollection = 'users';
        }

        displayUserProfile();
        if (currentUser.photoURL) updateProfilePicture(currentUser.photoURL);

    } catch (error) {
        console.error('❌ Error loading profile:', error);
        showNotification('Error loading profile', 'error');
    } finally {
        showLoading(false);
    }
}

function displayUserProfile() {
    const avatar = document.getElementById('profileAvatar');
    const displayName = document.getElementById('profileDisplayName');
    const emailEl = document.getElementById('profileEmail');

    if (avatar && (userData.photoURL || currentUser.photoURL)) {
        avatar.src = userData.photoURL || currentUser.photoURL;
    }
    if (displayName) displayName.textContent = userData.fullName || currentUser.displayName || 'User';
    if (emailEl) emailEl.textContent = currentUser.email;

    const overviewFullName = document.getElementById('overviewFullName');
    const overviewEmail = document.getElementById('overviewEmail');
    const overviewAccountType = document.getElementById('overviewAccountType');
    const overviewMemberSince = document.getElementById('overviewMemberSince');
    const overviewPlan = document.getElementById('overviewPlan');

    if (overviewFullName) overviewFullName.textContent = userData.fullName || currentUser.displayName;
    if (overviewEmail) overviewEmail.textContent = currentUser.email;
    if (overviewAccountType) overviewAccountType.textContent = userData.authMethod === 'google' ? 'Google Account' : 'Email Account';
    if (overviewPlan) overviewPlan.textContent = userData.plan === 'free' ? 'Free' : 'Premium';

    const memberSince = userData.createdAt || currentUser.metadata?.creationTime;
    if (overviewMemberSince && memberSince) {
        overviewMemberSince.textContent = new Date(memberSince).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }
}

async function updateProfileData(event) {
    event.preventDefault();

    const saveBtn = document.getElementById('saveProfileBtn');
    const successDiv = document.getElementById('editSuccess');
    const errorDiv = document.getElementById('editError');

    if (successDiv) successDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';

    setButtonLoading(saveBtn, true);

    try {
        const fullName = document.getElementById('editFullName')?.value.trim();
        const bio = document.getElementById('editBio')?.value.trim();
        const location = document.getElementById('editLocation')?.value.trim();

        if (!fullName) throw new Error('Full name is required');

        const updateData = {
            fullName,
            bio: bio || '',
            location: location || '',
            updatedAt: new Date().toISOString()
        };

        await updateDoc(doc(db, userCollection, currentUser.uid), updateData);

        if (currentUser.displayName !== fullName) {
            await updateProfile(currentUser, { displayName: fullName });
        }

        userData = { ...userData, ...updateData };

        const profileDisplayName = document.getElementById('profileDisplayName');
        const overviewFullName = document.getElementById('overviewFullName');
        const overviewBio = document.getElementById('overviewBio');
        const overviewLocation = document.getElementById('overviewLocation');

        if (profileDisplayName) profileDisplayName.textContent = fullName;
        if (overviewFullName) overviewFullName.textContent = fullName;
        if (overviewBio) overviewBio.textContent = bio || 'Not provided';
        if (overviewLocation) overviewLocation.textContent = location || 'Not provided';

        if (successDiv) {
            successDiv.style.display = 'block';
            successDiv.innerHTML = '<i class="fas fa-check-circle"></i> Profile updated successfully!';
            setTimeout(() => { successDiv.style.display = 'none'; }, 3000);
        }
    } catch (error) {
        console.error('❌ Update error:', error);
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${error.message}`;
        }
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

async function changePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmNewPassword')?.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        showNotification('New passwords do not match', 'error');
        return;
    }
    if (newPassword.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }

    const btn = document.getElementById('updatePasswordBtn');
    setButtonLoading(btn, true);

    try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);

        showNotification('Password updated successfully!', 'success');

        ['currentPassword', 'newPassword', 'confirmNewPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    } catch (error) {
        console.error('❌ Password change error:', error);
        const errorMessage = error.code === 'auth/wrong-password'
            ? 'Current password is incorrect.'
            : 'Failed to update password: ' + error.message;
        showNotification(errorMessage, 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

function setupAvatarUpload() {
    const editBtn = document.getElementById('editAvatarBtn');
    if (!editBtn) return;

    editBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                showNotification('File size must be less than 2MB', 'error');
                return;
            }
            if (!file.type.startsWith('image/')) {
                showNotification('Please upload an image file', 'error');
                return;
            }

            setButtonLoading(editBtn, true);

            try {
                const storageRef = ref(storage, `avatars/${currentUser.uid}`);
                await uploadBytes(storageRef, file);
                const photoURL = await getDownloadURL(storageRef);

                await updateProfile(currentUser, { photoURL });
                await updateDoc(doc(db, userCollection, currentUser.uid), {
                    photoURL,
                    updatedAt: new Date().toISOString()
                });

                const profileAvatar = document.getElementById('profileAvatar');
                if (profileAvatar) profileAvatar.src = photoURL;

                showNotification('Profile picture updated!', 'success');
            } catch (error) {
                console.error('❌ Avatar upload error:', error);
                showNotification('Failed to upload image', 'error');
            } finally {
                setButtonLoading(editBtn, false);
            }
        };

        input.click();
    });
}

// FIX: Google users now properly re-authenticate before deletion
async function deleteAccount() {
    const confirmed = confirm(
        '⚠️ Are you sure you want to delete your account?\n\nThis action cannot be undone.'
    );
    if (!confirmed) return;

    const btn = document.getElementById('deleteAccountBtn');
    setButtonLoading(btn, true);

    try {
        // Re-authenticate based on auth method
        if (userData?.authMethod === 'google') {
            const provider = new GoogleAuthProvider();
            await reauthenticateWithPopup(currentUser, provider);
        } else {
            const password = prompt('Please enter your password to confirm deletion:');
            if (!password) { setButtonLoading(btn, false); return; }
            const credential = EmailAuthProvider.credential(currentUser.email, password);
            await reauthenticateWithCredential(currentUser, credential);
        }

        // Delete avatar from storage if it exists
        if (currentUser.photoURL && currentUser.photoURL.includes('firebasestorage')) {
            try {
                const storageRef = ref(storage, `avatars/${currentUser.uid}`);
                await deleteObject(storageRef);
            } catch (_) {
                // No avatar file — fine to ignore
            }
        }

        await deleteDoc(doc(db, userCollection, currentUser.uid));
        await currentUser.delete();

        localStorage.removeItem('user');
        window.location.href = 'index.html';

    } catch (error) {
        console.error('❌ Delete account error:', error);
        const errorMessage = error.code === 'auth/wrong-password'
            ? 'Incorrect password.'
            : 'Failed to delete account: ' + error.message;
        showNotification(errorMessage, 'error');
        setButtonLoading(btn, false);
    }
}

// ========================================
// ========== HELPER FUNCTIONS ==========
// ========================================

function setupSimpleTabs() {
    const overviewBtn = document.getElementById('overviewTabBtn');
    const editBtn = document.getElementById('editTabBtn');
    const overview = document.getElementById('overviewContent');
    const edit = document.getElementById('editContent');
    if (!overviewBtn || !editBtn) return;

    overviewBtn.addEventListener('click', () => {
        overviewBtn.classList.add('active'); editBtn.classList.remove('active');
        overview?.classList.add('active'); edit?.classList.remove('active');
    });
    editBtn.addEventListener('click', () => {
        editBtn.classList.add('active'); overviewBtn.classList.remove('active');
        edit?.classList.add('active'); overview?.classList.remove('active');
    });
}

function setupPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', function() {
            const wrapper = this.closest('.password-input-wrapper');
            if (!wrapper) return;
            const input = wrapper.querySelector('input');
            const icon = this.querySelector('i');
            if (!input || !icon) return;
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
}

function setupEventListeners() {
    document.getElementById('editProfileForm')?.addEventListener('submit', updateProfileData);

    document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
        document.getElementById('overviewTabBtn')?.click();
    });

    document.getElementById('updatePasswordBtn')?.addEventListener('click', changePassword);
    document.getElementById('deleteAccountBtn')?.addEventListener('click', deleteAccount);

    setupAvatarUpload();
}

// FIX: Unified setButtonLoading (was duplicated as setLoading + setButtonLoading)
function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    } else if (btn.dataset.originalText) {
        btn.innerHTML = btn.dataset.originalText;
    }
}

// Keep setLoading as alias for login/signup buttons which use a different inner structure
function setLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    const btnText = btn.querySelector('.btn-text');
    const btnIcon = btn.querySelector('i:not(.fa-spinner)');
    const loader = btn.querySelector('.btn-loader');
    if (isLoading) {
        if (btnText) btnText.style.opacity = '0.5';
        if (btnIcon) btnIcon.style.opacity = '0.5';
        if (loader) loader.style.display = 'inline-block';
    } else {
        if (btnText) btnText.style.opacity = '1';
        if (btnIcon) btnIcon.style.opacity = '1';
        if (loader) loader.style.display = 'none';
    }
}

function setGoogleLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    const btnText = btn.querySelector('.btn-text');
    const btnIcon = btn.querySelector('.fab');
    const loader = btn.querySelector('.btn-loader');
    if (isLoading) {
        if (btnText) btnText.style.opacity = '0.5';
        if (btnIcon) btnIcon.style.opacity = '0.5';
        if (loader) loader.style.display = 'inline-block';
    } else {
        if (btnText) btnText.style.opacity = '1';
        if (btnIcon) btnIcon.style.opacity = '1';
        if (loader) loader.style.display = 'none';
    }
}

function showLoading(show) {
    const loader = document.getElementById('loadingSpinner');
    if (loader) loader.style.display = show ? 'block' : 'none';
}

function showNotification(message, type) {
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.style.cssText = `
            position:fixed;top:20px;right:20px;padding:15px 25px;
            border-radius:10px;color:white;font-weight:500;z-index:9999;
            display:none;box-shadow:0 5px 15px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(notification);
    }
    notification.style.backgroundColor = type === 'success' ? '#10b981' : '#ef4444';
    notification.innerHTML = message;
    notification.style.display = 'block';
    setTimeout(() => { notification.style.display = 'none'; }, 3000);
}

function showError(div, message) {
    if (!div) return;
    div.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    div.style.display = 'block';
    setTimeout(() => { div.style.display = 'none'; }, 5000);
}

function showSuccess(div, message) {
    if (!div) return;
    div.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    div.style.display = 'block';
}

// ========================================
// ========== AUTH STATE ==========
// ========================================

function checkAuthState() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const fetchedData = await getUserFromDatabase(user.uid);
            updateUIForLoggedIn(user, fetchedData?.authMethod || 'email');

            if (window.location.pathname.includes('profile.html')) {
                await loadUserProfile();
                setupEventListeners();
                setupSimpleTabs();
                setupPasswordToggles();
            }
        } else {
            currentUser = null;
            updateUIForLoggedOut();
        }
    });
}

function updateUIForLoggedIn(user, authMethod) {
    document.getElementById('dashboardLink')?.style.setProperty('display', 'flex');
    document.getElementById('logoutBtn')?.style.setProperty('display', 'flex');
    document.getElementById('loginLink')?.style.setProperty('display', 'none');
    document.getElementById('signupLink')?.style.setProperty('display', 'none');

    localStorage.setItem('user', JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        authMethod
    }));

    updateDynamicMenu(user);
}

function updateUIForLoggedOut() {
    document.getElementById('dashboardLink')?.style.setProperty('display', 'none');
    document.getElementById('logoutBtn')?.style.setProperty('display', 'none');
    document.getElementById('loginLink')?.style.setProperty('display', 'flex');
    document.getElementById('signupLink')?.style.setProperty('display', 'flex');
    localStorage.removeItem('user');
    updateDynamicMenu(null);
}

// ========================================
// ========== PARAPHRASING TOOL ==========
// FIX: Rewrote fetchParaphraseUserType to use modular SDK (was using legacy firebase.auth())
// ========================================

// FIX: Shared helper to get user type — avoids duplicate code in paraphrase + plagiarism
async function resolveCurrentUserType() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const data = await getUserFromDatabase(user.uid);
                resolve(data?.plan === 'premium' ? 'premium' : 'free');
            } else {
                resolve('free');
            }
        });
    });
}

async function fetchParaphraseUserType() {
    currentUserType = await resolveCurrentUserType();
    console.log("✅ Paraphrase user type:", currentUserType);
    updateModeOptions();
    if (typeof countParaphraseWords === 'function') countParaphraseWords();
}

function updateModeOptions() {
    const modeSelect = document.getElementById('mode');
    if (!modeSelect) return;

    Array.from(modeSelect.options).forEach(option => {
        option.disabled = false;
        option.text = option.text.replace(' 🔒', '').replace(' ⭐', '');
    });

    Array.from(modeSelect.options).forEach(option => {
        if (['creative', 'academic'].includes(option.value)) {
            if (currentUserType !== 'premium') {
                option.disabled = true;
                option.text += ' 🔒';
            } else {
                option.text += ' ⭐';
            }
        }
    });
}

function countParaphraseWords() {
    const text = document.getElementById('inputText')?.value || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const limit = currentUserType === 'premium' ? '∞' : '500';

    const inputWordsEl = document.getElementById('inputWords');
    const inputCharsEl = document.getElementById('inputChars');
    if (inputWordsEl) inputWordsEl.innerHTML = `<strong>${words}</strong>/${limit} words`;
    if (inputCharsEl) inputCharsEl.innerHTML = `<strong>${chars}</strong> chars`;

    const limitMessage = document.getElementById('limitMessage');
    const btn = document.getElementById('paraphraseBtn');
    const over = words > 500 && currentUserType !== 'premium';
    if (limitMessage) limitMessage.style.display = over ? 'flex' : 'none';
    if (btn) btn.disabled = over;
}

function checkModeRestriction() {
    const modeSelect = document.getElementById('mode');
    if (!modeSelect) return;
    const selected = modeSelect.value;
    if (['creative', 'academic'].includes(selected) && currentUserType !== 'premium') {
        const featureName = modeSelect.options[modeSelect.selectedIndex].text.replace(' 🔒', '');
        const premiumFeatureName = document.getElementById('premiumFeatureName');
        if (premiumFeatureName) premiumFeatureName.textContent = featureName;
        showPremiumModal();
        modeSelect.value = 'simple';
    }
}

function showPremiumModal() {
    document.getElementById('premiumModal')?.classList.add('show');
}

function closeModal() {
    document.getElementById('premiumModal')?.classList.remove('show');
}

async function paraphraseText() {
    const text = document.getElementById('inputText')?.value || '';
    const mode = document.getElementById('mode')?.value || 'simple';
    const output = document.getElementById('outputText');
    const btn = document.getElementById('paraphraseBtn');

    if (['creative', 'academic'].includes(mode) && currentUserType !== 'premium') {
        showParaphraseToast('Premium feature! Upgrade to unlock this mode.', 'error');
        showPremiumModal();
        return;
    }
    if (!text.trim()) {
        showParaphraseToast('Please enter some text to paraphrase', 'error');
        return;
    }
    const words = text.trim().split(/\s+/).length;
    if (words > 500 && currentUserType !== 'premium') {
        showParaphraseToast('Word limit exceeded! Upgrade to premium for unlimited words.', 'warning');
        showPremiumModal();
        return;
    }

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        const response = await fetch(PARAPHRASE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, mode })
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const data = await response.json();

        if (data.error) {
            showParaphraseToast(data.error, 'error');
            if (data.error.includes('Upgrade') || data.error.includes('premium')) showPremiumModal();
            const simulated = generateFallbackParaphrasedText(text, mode);
            if (output) output.value = simulated;
            updateOutputStats('paraphrase', simulated);
        } else if (data.paraphrased) {
            if (output) output.value = data.paraphrased;
            showParaphraseToast('✨ Paraphrased successfully!', 'success');
            updateOutputStats('paraphrase', data.paraphrased);
        } else {
            throw new Error('Invalid response format');
        }

    } catch (error) {
        console.error('❌ Paraphrase API Error:', error);
        showParaphraseToast('Server error. Using simulation mode.', 'error');
        const simulated = generateFallbackParaphrasedText(text, mode);
        if (output) output.value = simulated;
        updateOutputStats('paraphrase', simulated);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

// FIX: Extracted duplicate output stat update into one shared helper
function updateOutputStats(page, text) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const outputWordsEl = document.getElementById('outputWords');
    const outputCharsEl = document.getElementById('outputChars');
    if (outputWordsEl) outputWordsEl.innerHTML = `<strong>${words}</strong> words`;
    if (outputCharsEl) outputCharsEl.innerHTML = `<strong>${chars}</strong> chars`;
}

function enforceParaphraseWordLimit() {
    const inputText = document.getElementById('inputText');
    if (!inputText) return;
    const words = inputText.value.trim() ? inputText.value.trim().split(/\s+/).length : 0;
    if (words > 500 && currentUserType !== 'premium') {
        inputText.value = inputText.value.trim().split(/\s+/).slice(0, 500).join(' ');
        showParaphraseToast('Word limit reached. Upgrade to Premium for unlimited words!', 'warning');
    }
    countParaphraseWords();
}

function generateFallbackParaphrasedText(text, mode) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const synonymMap = {
        'quick': 'fast', 'important': 'crucial', 'big': 'large',
        'small': 'tiny', 'good': 'excellent', 'bad': 'poor',
        'fast': 'rapid', 'large': 'substantial', 'happy': 'joyful',
        'sad': 'unhappy', 'beautiful': 'lovely', 'ugly': 'unpleasant'
    };
    const replaceSynonyms = (s) => {
        let result = s;
        for (const [word, synonym] of Object.entries(synonymMap)) {
            result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), synonym);
        }
        return result;
    };
    const modes = {
        simple: (s) => { const r = replaceSynonyms(s.trim()); return r.charAt(0).toUpperCase() + r.slice(1); },
        formal: (s) => `It can be stated that ${s.trim().charAt(0).toLowerCase() + s.trim().slice(1)}`,
        creative: (s) => `✨ ${replaceSynonyms(s.trim())}`,
        academic: (s) => `According to scholarly analysis, ${s.trim().toLowerCase()}. This demonstrates a structured interpretation.`
    };
    const fn = modes[mode] || modes.simple;
    let result = sentences.map(fn).join('. ').trim();
    if (!/[.!?]$/.test(result)) result += '.';
    return result;
}

// FIX: clipboard now properly awaited and has error handling
async function copyParaphraseText() {
    const text = document.getElementById('outputText')?.value || '';
    if (!text.trim()) { showParaphraseToast('Nothing to copy', 'error'); return; }
    try {
        await navigator.clipboard.writeText(text);
        showParaphraseToast('Copied to clipboard!', 'success');
    } catch {
        showParaphraseToast('Copy failed — try selecting the text manually', 'error');
    }
}

function downloadParaphraseText() {
    const text = document.getElementById('outputText')?.value || '';
    if (!text.trim()) { showParaphraseToast('Nothing to download', 'error'); return; }
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paraphrased-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showParaphraseToast('File downloaded!', 'success');
}

function shareParaphraseText() {
    const text = document.getElementById('outputText')?.value || '';
    if (!text.trim()) { showParaphraseToast('Nothing to share', 'error'); return; }
    if (navigator.share) {
        navigator.share({ title: 'Paraphrased Text', text }).catch(() => copyParaphraseText());
    } else {
        copyParaphraseText();
    }
}

function showParaphraseToast(msg, type = 'success') {
    document.querySelectorAll('.paraphrase-toast').forEach(t => t.remove());
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b' };
    const icons = { success: '✓', error: '✗', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = 'paraphrase-toast';
    toast.innerHTML = `<span style="font-weight:bold;margin-right:8px;">${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
    toast.style.cssText = `
        position:fixed;bottom:20px;right:20px;padding:12px 20px;
        background:${colors[type] || '#3b82f6'};color:white;border-radius:8px;
        font-size:14px;z-index:10000;display:flex;align-items:center;gap:8px;
        box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideOut 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function injectToastAnimations() {
    if (document.getElementById('toast-animations')) return;
    const style = document.createElement('style');
    style.id = 'toast-animations';
    style.textContent = `
        @keyframes slideIn { from { transform:translateX(100%);opacity:0; } to { transform:translateX(0);opacity:1; } }
        @keyframes slideOut { from { transform:translateX(0);opacity:1; } to { transform:translateX(100%);opacity:0; } }
    `;
    document.head.appendChild(style);
}

function initParaphrasingTool() {
    console.log("🚀 Initializing paraphrasing tool...");
    injectToastAnimations();
    fetchParaphraseUserType();
    countParaphraseWords();

    document.getElementById('clearBtn')?.addEventListener('click', () => {
        const inputText = document.getElementById('inputText');
        const outputText = document.getElementById('outputText');
        if (inputText) inputText.value = '';
        if (outputText) outputText.value = '';
        countParaphraseWords();
        showParaphraseToast('All fields cleared', 'success');
    });

    const inputText = document.getElementById('inputText');
    if (inputText) {
        inputText.addEventListener('input', enforceParaphraseWordLimit);
        inputText.addEventListener('paste', () => setTimeout(enforceParaphraseWordLimit, 10));
    }
    console.log("✅ Paraphrasing tool ready!");
}

// ========================================
// ========== PLAGIARISM CHECKER ==========
// FIX: Rewrote fetchPlagiarismUserType to use modular SDK
// FIX: Simulation mode now clearly labels results as demo data
// ========================================

async function fetchPlagiarismUserType() {
    currentUserType = await resolveCurrentUserType();
    console.log("✅ Plagiarism user type:", currentUserType);
    if (typeof countPlagiarismWords === 'function') countPlagiarismWords();
}

function countPlagiarismWords() {
    const inputText = document.getElementById('inputText');
    if (!inputText) return;
    const text = inputText.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const limit = currentUserType === 'premium' ? '∞' : '500';

    const inputWordsEl = document.getElementById('inputWords');
    const inputCharsEl = document.getElementById('inputChars');
    if (inputWordsEl) inputWordsEl.innerHTML = `<i class="fas fa-font"></i> <strong>${words}</strong>/${limit} words`;
    if (inputCharsEl) inputCharsEl.innerHTML = `<i class="fas fa-keyboard"></i> <strong>${chars}</strong> chars`;

    const limitMessage = document.getElementById('limitMessage');
    const checkBtn = document.getElementById('checkBtn');
    const over = words > 500 && currentUserType !== 'premium';
    if (limitMessage) limitMessage.style.display = over ? 'flex' : 'none';
    if (checkBtn) checkBtn.disabled = over;
}

function enforceWordLimit() {
    const inputText = document.getElementById('inputText');
    if (!inputText) return;
    const words = inputText.value.trim() ? inputText.value.trim().split(/\s+/).length : 0;
    if (words > 500 && currentUserType !== 'premium') {
        inputText.value = inputText.value.trim().split(/\s+/).slice(0, 500).join(' ');
        showPlagiarismToast('Word limit reached. Upgrade to Premium for unlimited words!', 'warning');
    }
    countPlagiarismWords();
}

async function checkPlagiarism() {
    const inputText = document.getElementById('inputText');
    if (!inputText) return;
    const inputValue = inputText.value;
    const sensitivity = document.getElementById('checkMode')?.value || 'quick';
    const checkBtn = document.getElementById('checkBtn');
    const loadingSection = document.getElementById('loadingSection');
    const resultsSection = document.getElementById('resultsSection');

    if (!inputValue.trim()) { showPlagiarismToast('Please enter some text to check', 'error'); return; }

    const words = inputValue.trim().split(/\s+/).length;
    if (words > 500 && currentUserType !== 'premium') {
        showPlagiarismToast('Word limit exceeded! Upgrade to premium for unlimited checks.', 'warning');
        showPremiumModal();
        return;
    }

    const originalHTML = checkBtn.innerHTML;
    checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
    checkBtn.disabled = true;
    if (loadingSection) loadingSection.style.display = 'flex';
    if (resultsSection) resultsSection.style.display = 'none';

    try {
        const response = await fetch(PLAGIARISM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: inputValue, sensitivity })
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const data = await response.json();

        if (data.error) {
            showPlagiarismToast(data.error, 'error');
            if (data.error.includes('Upgrade') || data.error.includes('premium')) showPremiumModal();
            return;
        }

        displayPlagiarismResults(data.plagiarismScore, data.originalityScore, data.similarityScore, data.matches, words, data.message, false);
        showPlagiarismToast('Analysis complete!', 'success');

    } catch (error) {
        console.error('❌ Plagiarism API Error:', error);
        // FIX: clearly label simulated results as demo, not real results
        showPlagiarismToast('Server offline — showing demo results only', 'warning');
        const demoPlague = Math.floor(Math.random() * 30);
        displayPlagiarismResults(demoPlague, 100 - demoPlague, Math.floor(Math.random() * 20), Math.floor(Math.random() * 50), words, null, true);
    } finally {
        checkBtn.innerHTML = originalHTML;
        checkBtn.disabled = false;
        if (loadingSection) loadingSection.style.display = 'none';
        if (resultsSection) resultsSection.style.display = 'block';
    }
}

function displayPlagiarismResults(plagiarismPercent, originalPercent, similarityPercent, matches, words, message, isDemo) {
    const progressCircle = document.getElementById('progressCircle');
    if (progressCircle) {
        const circumference = 2 * Math.PI * 80;
        progressCircle.style.strokeDashoffset = circumference - (plagiarismPercent / 100) * circumference;
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('plagiarismPercent', plagiarismPercent + '%');
    set('originalPercent', originalPercent + '%');
    set('plagiarizedPercent', plagiarismPercent + '%');
    set('similarityPercent', similarityPercent + '%');
    set('uniqueScore', originalPercent + '%');
    set('wordCount', words);
    set('matchedSources', matches ?? '-');
    set('processingTime', (Math.random() * 2 + 0.5).toFixed(1) + 's');
    set('sourceCount', '8.2B');

    const colors = plagiarismPercent === 0 ? '#00ff88' : plagiarismPercent < 10 ? '#00d4ff' : plagiarismPercent < 25 ? '#ffaa00' : '#ff4444';
    const labels = plagiarismPercent === 0 ? ['Perfectly Original', 'Excellent!'] : plagiarismPercent < 10 ? ['Mostly Original', 'Good'] : plagiarismPercent < 25 ? ['Some Similarity', 'Needs Review'] : ['High Plagiarism', 'Alert!'];

    if (progressCircle) progressCircle.style.stroke = colors;
    set('plagiarismLabel', labels[0]);

    const resultMessage = document.getElementById('resultMessage');
    if (resultMessage) {
        const icon = resultMessage.querySelector('.message-icon i');
        const title = resultMessage.querySelector('h4');
        const text = resultMessage.querySelector('p');
        const iconNames = ['fa-check-circle', 'fa-info-circle', 'fa-exclamation-triangle', 'fa-times-circle'];
        const iconIdx = plagiarismPercent === 0 ? 0 : plagiarismPercent < 10 ? 1 : plagiarismPercent < 25 ? 2 : 3;
        if (icon) { icon.className = `fas ${iconNames[iconIdx]}`; icon.style.color = colors; }
        if (title) title.textContent = labels[1] + (isDemo ? ' (Demo)' : '');
        if (text) text.textContent = message || (isDemo ? '⚠️ Demo results — server offline. Connect your backend for real analysis.' : 'Analysis complete.');
    }
}

async function copyPlagiarismReport() {
    const get = (id) => document.getElementById(id)?.textContent || '0%';
    const report = `Plagiarism Report:\nOriginality: ${get('originalPercent')}\nMatched: ${get('plagiarismPercent')}\nSimilarity: ${get('similarityPercent')}\nWords: ${get('wordCount')}\nSources: ${get('sourceCount')}`;
    try {
        await navigator.clipboard.writeText(report);
        showPlagiarismToast('Report copied to clipboard!', 'success');
    } catch {
        showPlagiarismToast('Copy failed — try manually', 'error');
    }
}

function downloadPlagiarismReport() {
    const get = (id) => document.getElementById(id)?.textContent || 'N/A';
    const report = `PLAGIARISM CHECK REPORT\nGenerated: ${new Date().toLocaleString()}\n-----------------------------------\nOriginality: ${get('originalPercent')}\nMatched Content: ${get('plagiarismPercent')}\nSimilarity Score: ${get('similarityPercent')}\nWords Analyzed: ${get('wordCount')}\nSources Checked: ${get('sourceCount')}\nMatches Found: ${get('matchedSources')}\nProcessing Time: ${get('processingTime')}\n-----------------------------------\nThis is an automated report.`;
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plagiarism-report.txt';
    a.click();
    URL.revokeObjectURL(url);
    showPlagiarismToast('Report downloaded!', 'success');
}

function sharePlagiarismReport() {
    const report = `Plagiarism Check: ${document.getElementById('originalPercent')?.textContent || '0%'} Original`;
    if (navigator.share) {
        navigator.share({ title: 'Plagiarism Report', text: report });
    } else {
        copyPlagiarismReport();
    }
}

function showPlagiarismToast(message, type = 'success') {
    injectToastAnimations();
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:10000;';
        document.body.appendChild(container);
    }
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle' };
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}" style="margin-right:8px;"></i><span>${message}</span>`;
    toast.style.cssText = `padding:12px 18px;background:${colors[type] || '#3b82f6'};color:white;border-radius:8px;font-size:14px;display:flex;align-items:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideOut 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function initPlagiarismChecker() {
    console.log("🚀 Initializing Plagiarism Checker...");
    injectToastAnimations();
    fetchPlagiarismUserType();
    countPlagiarismWords();

    const inputText = document.getElementById('inputText');
    if (inputText) {
        inputText.addEventListener('paste', () => setTimeout(enforceWordLimit, 10));
        inputText.addEventListener('input', enforceWordLimit);
    }

    document.getElementById('clearBtn')?.addEventListener('click', () => {
        const el = document.getElementById('inputText');
        const rs = document.getElementById('resultsSection');
        if (el) el.value = '';
        if (rs) rs.style.display = 'none';
        countPlagiarismWords();
        showPlagiarismToast('Text cleared', 'success');
    });

    document.getElementById('copyReportBtn')?.addEventListener('click', copyPlagiarismReport);
    document.getElementById('downloadReportBtn')?.addEventListener('click', downloadPlagiarismReport);
    document.getElementById('shareReportBtn')?.addEventListener('click', sharePlagiarismReport);
    document.getElementById('clearAllBtn')?.addEventListener('click', () => {
        const el = document.getElementById('inputText');
        const rs = document.getElementById('resultsSection');
        if (el) el.value = '';
        if (rs) rs.style.display = 'none';
        countPlagiarismWords();
        showPlagiarismToast('All cleared', 'success');
    });

    console.log("✅ Plagiarism checker ready!");
}

// ========================================
// ========== LAYOUT & THEME ==========
// ========================================

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

window.loadComponent = function(componentId, filePath) {
    const element = document.getElementById(componentId);
    if (!element) return;
    fetch(filePath)
        .then(r => r.text())
        .then(data => { element.innerHTML = data; })
        .catch(err => console.log('Error loading component:', err));
};

window.toggleDarkMode = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.querySelectorAll('.toggle-indicator i, .toggle-icon').forEach(icon => {
        icon.className = newTheme === 'dark' ? 'fas fa-toggle-on' : 'fas fa-toggle-off';
    });
    document.querySelectorAll('.theme-toggle i:first-child, .theme-toggle-btn i:first-child').forEach(icon => {
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });
};

// ========================================
// ========== SCROLL ANIMATIONS ==========
// ========================================
function initializeScrollAnimations() {
    const items = document.querySelectorAll('.animate-on-scroll');
    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => e.isIntersecting && e.target.classList.add('animate-in'));
    }, { threshold: 0.2 });
    items.forEach(el => observer.observe(el));
}

// ========================================
// ========== MAIN INIT ==========
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log("✅ MiniToolBox Master JS Loaded");
    loadTheme();
    checkAuthState();
    setupForgotPasswordHandler();
    initializeScrollAnimations();

    document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);

    const googleBtn = document.getElementById('googleLoginBtn') || document.getElementById('googleSignupBtn');
    if (googleBtn) {
        googleBtn.addEventListener('click', handleGoogleLogin);
        console.log("✅ Google button handler attached");
    }

    document.getElementById('logoutBtn')?.addEventListener('click', window.handleLogout);

    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', function() {
            const wrapper = this.closest('.password-input-wrapper');
            if (!wrapper) return;
            const input = wrapper.querySelector('input');
            if (input) togglePassword(input.id, this);
        });
    });

    if (window.location.pathname.includes('paraphrasing.html')) initParaphrasingTool();
    if (window.location.pathname.includes('plagiarism.html')) initPlagiarismChecker();
});

// ========================================
// ========== GLOBAL EXPORTS ==========
// ========================================
window.togglePassword = togglePassword;
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleGoogleLogin = handleGoogleLogin;

window.paraphraseText = paraphraseText;
window.copyText = copyParaphraseText;
window.downloadText = downloadParaphraseText;
window.shareText = shareParaphraseText;
window.checkModeRestriction = checkModeRestriction;
window.showPremiumModal = showPremiumModal;
window.closeModal = closeModal;

window.checkPlagiarism = checkPlagiarism;
window.copyReport = copyPlagiarismReport;
window.downloadReport = downloadPlagiarismReport;
window.shareReport = sharePlagiarismReport;
window.enforceWordLimit = enforceWordLimit;

console.log("✅ All functions exported successfully!");







