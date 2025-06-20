// Cache duration in milliseconds (e.g., 1 hour)
const CACHE_DURATION = 60 * 60 * 1000;

const firebaseConfig = {
    apiKey: "AIzaSyDRSW3u6gJSs98Z2Mkp5DYSC__ibDXXHAE",
    authDomain: "studiosync-af73d.firebaseapp.com",
    projectId: "studiosync-af73d",
    storageBucket: "studiosync-af73d.appspot.com",
    messagingSenderId: "172555302276",
    appId: "1:172555302276:web:55b661f9849441e2de59d1",
    measurementId: "G-EK7EFQGMSG"
};

// Initialize Firebase if it hasn't been initialized yet
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

class StudioContext {
    static async initialize() {
        const loadingStatus = document.getElementById('loadingStatus');
        if (loadingStatus) loadingStatus.textContent = "Checking cached data...";

        try {
            // Check for cached data
            const cachedData = this.getCachedData();
            if (cachedData) {
                // Apply cached data immediately
                this.applyStudioContext(cachedData);
                
                // Refresh cache in background if it's getting stale
                if (this.shouldRefreshCache(cachedData.timestamp)) {
                    this.refreshCache();
                }
                return true;
            }

            // If no cache, load fresh data
            return await this.refreshCache();
        } catch (error) {
            console.error('Error initializing studio context:', error);
            return false;
        }
    }

    static getCachedData() {
        const cached = localStorage.getItem('studioContextCache');
        if (!cached) return null;

        const parsedCache = JSON.parse(cached);
        if (!this.isCacheValid(parsedCache.timestamp)) {
            localStorage.removeItem('studioContextCache');
            return null;
        }

        return parsedCache;
    }

    static isCacheValid(timestamp) {
        return Date.now() - timestamp < CACHE_DURATION;
    }

    static shouldRefreshCache(timestamp) {
        // Refresh if cache is more than 50% through its lifetime
        return Date.now() - timestamp > (CACHE_DURATION / 2);
    }

    static async refreshCache() {
        const loadingStatus = document.getElementById('loadingStatus');
        if (loadingStatus) loadingStatus.textContent = "Refreshing studio data...";

        try {
            const user = firebase.auth().currentUser;
            if (!user) {
                window.location.href = '/studiologin.html';
                return false;
            }

            const studioId = localStorage.getItem('currentStudioId');
            const userDocId = localStorage.getItem('userDocId');

            // Fetch user data
            const userDoc = await firebase.firestore()
                .collection('Studios')
                .doc(studioId)
                .collection('Users')
                .doc(userDocId)
                .get();

            const instructorDoc = !userDoc.exists ? await firebase.firestore()
                .collection('Studios')
                .doc(studioId)
                .collection('Instructors')
                .doc(user.uid)
                .get() : null;

            let userData = userDoc.exists ? userDoc.data() : instructorDoc?.exists ? instructorDoc.data() : null;
            
            if (!userData) {
                throw new Error('No user data found');
            }

            // Get studio data
            const studioData = JSON.parse(localStorage.getItem('currentStudioData'));

            // Create cache object
            const cacheData = {
                timestamp: Date.now(),
                userData: userData,
                studioData: studioData
            };

            // Save to cache
            localStorage.setItem('studioContextCache', JSON.stringify(cacheData));

            // Apply the context
            this.applyStudioContext(cacheData);
            return true;
        } catch (error) {
            console.error('Error refreshing cache:', error);
            return false;
        }
    }

    static applyStudioContext(cacheData) {
        const { userData, studioData } = cacheData;

        // Apply user data
        if (userData) {
            const fullName = `${userData.FirstName} ${userData.LastName}`;
            const userNameElement = document.getElementById('userName');
            const userEmailElement = document.getElementById('userEmail');
            const userRoleElement = document.getElementById('userRole');

            if (userNameElement) userNameElement.textContent = fullName;
            if (userEmailElement) userEmailElement.textContent = userData.Email;
            
            if (userRoleElement) {
                if (userData.Role) {
                    userRoleElement.textContent = userData.Role;
                    userRoleElement.style.color = '#333333';
                    userRoleElement.style.fontWeight = '700';
                } else {
                    userRoleElement.textContent = 'No Role Assigned';
                    userRoleElement.style.color = '#666';
                }
            }
        }

        // Apply studio branding
        if (studioData) {
            // Apply colors
            document.documentElement.style.setProperty('--primary-color', studioData.PrimaryColor || '#3DCED7');
            document.documentElement.style.setProperty('--primary-hover', this.adjustColor(studioData.PrimaryColor || '#3DCED7', -10));
            document.documentElement.style.setProperty('--secondary-color', studioData.SecondaryColor || '#3A506B');

            // Apply logo
            const logoElement = document.getElementById('studio-logo');
            const nameElement = document.getElementById('studio-name');
            
            if (logoElement && nameElement) {
                if (studioData.LogoUrl) {
                    logoElement.src = studioData.LogoUrl;
                    logoElement.alt = studioData.StudioName || 'Studio Logo';
                    logoElement.style.display = 'block';
                    nameElement.style.display = 'none';
                } else {
                    logoElement.style.display = 'none';
                    nameElement.textContent = studioData.StudioName || 'Studio Sync';
                    nameElement.style.display = 'block';
                }
            }
        }
    }

    static adjustColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (
            0x1000000 +
            (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
            (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
            (B < 255 ? (B < 1 ? 0 : B) : 255)
        ).toString(16).slice(1);
    }
} 