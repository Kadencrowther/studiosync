# StudioSync Collaboration Guide

## For Project Owner (Kaden)

### Adding a Developer
1. Go to https://github.com/Kadencrowther/studiosync/settings/access
2. Click "Add people"
3. Enter developer's GitHub email or username
4. Select "Write" access
5. Send invitation

### Development & Production Environments
- Development: studiosync-dev.web.app (for testing)
- Production: studiosyncdance.com (live site)

### Why We Use Development Environment Instead of Local Testing
1. **Real Environment Testing**:
   - Tests run in the actual Firebase hosting environment
   - Identical to production setup
   - No "works on my machine" problems

2. **Easy Collaboration**:
   - Everyone can see changes immediately
   - No need to set up local servers
   - Share development URLs in pull requests
   - Easy testing across different devices

3. **Faster Feedback Loop**:
   - Deploy and test quickly
   - Instant visibility for all team members
   - No local setup required
   - Test on multiple browsers easily

### Reviewing Changes
1. You'll get email notifications when:
   - Developer creates a Pull Request
   - Developer comments on code
   - Developer requests review

2. To review changes:
   - Check the development site (studiosync-dev.web.app)
   - Go to https://github.com/Kadencrowther/studiosync/pulls
   - Click on the Pull Request
   - Review the changes (green = added, red = removed)
   - Test the changes on development environment
   - Leave comments by clicking on specific lines
   - Click "Review changes" button to:
     - ✅ Approve
     - ❌ Request changes
     - 💬 Comment

3. After approving:
   - Click "Merge pull request"
   - Deploy to production: `firebase deploy --only hosting:production`
   - All changes are saved in GitHub's history

## For Developer (Vinny)

### Development Workflow Overview
1. Make code changes
2. Deploy to development: `firebase deploy --only hosting:development`
3. Test on development site (studiosync-dev.web.app)
4. Create Pull Request with development site link
5. Wait for review and approval
6. Changes go live after owner deploys to production

### First-Time Setup
1. Accept GitHub invitation from email
2. Clone repository:
   ```bash
   git clone https://github.com/Kadencrowther/studiosync.git
   cd studiosync
   npm install
   firebase login
   ```

### Making Changes
1. Always start fresh:
   ```bash
   git checkout main
   git pull origin main
   ```

2. Create new branch for your changes:
   ```bash
   git checkout -b feature/what-you-are-working-on
   ```

3. Make your changes to the code

4. Deploy to development environment for testing:
   ```bash
   firebase deploy --only hosting:development
   ```
   - Test your changes at studiosync-dev.web.app
   - Test on multiple devices/browsers
   - Make sure everything works as expected

5. Save your changes to GitHub:
   ```bash
   git add .
   git commit -m "Describe what you changed"
   git push origin feature/what-you-are-working-on
   ```

6. Create Pull Request:
   - Go to https://github.com/Kadencrowther/studiosync
   - Click "Pull Requests" → "New Pull Request"
   - Select your branch
   - Click "Create pull request"
   - Add description of changes
   - Add link to development site where changes can be tested
   - Wait for review

### Deployment Flow
1. Development (studiosync-dev.web.app):
   ```bash
   firebase deploy --only hosting:development
   ```
   - Use this for testing changes
   - Deploy here as often as needed
   - Share this URL for feedback

2. Production (studiosyncdance.com):
   - Only Kaden deploys to production
   - Happens after PR approval
   - Never deploy directly to production

### Best Practices
- ✨ Always test on development first
- 🔄 Deploy to development frequently
- 🌿 One feature/fix per branch
- 📝 Include development URL in PR
- 🚫 Never deploy to production
- ❓ Ask for feedback using development URL

### Important Notes
- ✨ GitHub saves ALL changes and their history
- 🔄 Always pull latest code before starting new work
- 🌿 Create new branch for each feature/fix
- 📝 Write clear descriptions in commits and PRs
- 🚫 Never commit directly to main branch
- 🎯 Always test on development first
- ❓ Ask questions in GitHub issues or comments

### Common Questions

**Q: How do I update my local code with latest changes?**
```bash
git checkout main
git pull origin main
```

**Q: How do I switch between branches?**
```bash
git checkout branch-name
```

**Q: How do I see what files I changed?**
```bash
git status
```

**Q: How do I undo my changes to a file?**
```bash
git checkout -- filename
```

**Q: Where can I see all past changes?**
- Go to https://github.com/Kadencrowther/studiosync/commits/main

**Q: How do I know if my changes are live on dev?**
- Check studiosync-dev.web.app after deploying
- Changes should be visible immediately

**Q: What if I need to test something quickly?**
- Always use the development environment
- Never test directly in production
- Deploy to development as often as needed 