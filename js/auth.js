// Check authentication status
firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
        // User is signed in
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = user.displayName || user.email;
        }
    } else {
        // No user is signed in, redirect to login
        window.location.href = 'login.html';
    }
});

// Logout functionality
document.addEventListener('DOMContentLoaded', function() {
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', function(e) {
            e.preventDefault();
            new bootstrap.Modal(document.getElementById('logoutModal')).show();
        });
    }

    const confirmLogout = document.getElementById('confirmLogout');
    if (confirmLogout) {
        confirmLogout.addEventListener('click', function() {
            firebase.auth().signOut().then(() => {
                // Sign-out successful.
                window.location.href = 'login.html';
            }).catch((error) => {
                // An error happened.
                console.error('Logout Error:', error);
            });
        });
    }
});