# StudioSync

A comprehensive studio management system.

## 🚀 Developer Setup Guide

### Prerequisites
- Node.js (v16 or higher)
- Firebase CLI (`npm install -g firebase-tools`)
- Git
- A code editor (VS Code recommended)

### First-Time Setup

1. **Clone the repository**
```bash
git clone https://github.com/Kadencrowther/studiosync.git
cd studiosync
```

2. **Install dependencies**
```bash
# Install main project dependencies
npm install

# Install Firebase Functions dependencies
cd functions
npm install
cd ..
```

3. **Environment Setup**
- Create a new file called `.env` in the root directory
- Contact the project owner for the required environment variables
- Firebase setup:
  ```bash
  firebase login
  ```

### 🔧 Development Workflow

1. **Always start fresh**:
```bash
git checkout main
git pull origin main
```

2. **Create a new branch for your feature**:
```bash
git checkout -b feature/your-feature-name
```

3. **Make your changes and test them locally**

4. **Commit your changes**:
```bash
git add .
git commit -m "Descriptive message about your changes"
```

5. **Push your branch**:
```bash
git push origin feature/your-feature-name
```

6. **Create a Pull Request**:
- Go to https://github.com/Kadencrowther/studiosync
- Click "Pull Requests" → "New Pull Request"
- Select your branch
- Fill in the description with what you changed and why
- Submit the PR for review

### 🏗️ Project Structure

- `/functions` - Firebase Cloud Functions
  - Contains backend serverless functions
  - Handles payments, subscriptions, and automated tasks
- `/public` - Frontend files
  - Main web application interface
  - HTML, CSS, and client-side JavaScript
- `/js` - JavaScript modules
  - Shared JavaScript functionality
  - Core business logic

### 💡 Common Tasks

- **Running locally**: `npm start`
- **Testing Firebase Functions locally**: 
  ```bash
  cd functions
  npm run serve
  ```
- **Viewing logs**: `firebase functions:log`

### ⚠️ Important Notes

1. Never commit directly to the `main` branch
2. Never commit sensitive information (API keys, passwords)
3. Keep pull requests focused on single features/fixes
4. Write clear commit messages
5. Update documentation when you change functionality

### 🆘 Need Help?

- Check existing documentation in the project
- Review previous pull requests for examples
- Contact the project owner for access to environment variables
- Create an issue for bugs or feature discussions

## Project Structure

- `/functions` - Firebase Cloud Functions
- `/public` - Frontend files
- `/js` - JavaScript modules 