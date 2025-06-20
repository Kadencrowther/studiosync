# StudioSync Collaboration Guide

## For Project Owner (Kaden)

### Adding a Developer
1. Go to https://github.com/Kadencrowther/studiosync/settings/access
2. Click "Add people"
3. Enter developer's GitHub email or username
4. Select "Write" access
5. Send invitation

### Reviewing Changes
1. You'll get email notifications when:
   - Developer creates a Pull Request
   - Developer comments on code
   - Developer requests review

2. To review changes:
   - Go to https://github.com/Kadencrowther/studiosync/pulls
   - Click on the Pull Request
   - Review the changes (green = added, red = removed)
   - Leave comments by clicking on specific lines
   - Click "Review changes" button to:
     - ✅ Approve
     - ❌ Request changes
     - 💬 Comment

3. After approving:
   - Click "Merge pull request"
   - Changes will be added to main code
   - All changes are saved in GitHub's history

## For Developer (Vinny)

### First-Time Setup
1. Accept GitHub invitation from email
2. Clone repository:
   ```bash
   git clone https://github.com/Kadencrowther/studiosync.git
   cd studiosync
   npm install
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

4. Save your changes to GitHub:
   ```bash
   git add .
   git commit -m "Describe what you changed"
   git push origin feature/what-you-are-working-on
   ```

5. Create Pull Request:
   - Go to https://github.com/Kadencrowther/studiosync
   - Click "Pull Requests" → "New Pull Request"
   - Select your branch
   - Click "Create pull request"
   - Add description of changes
   - Wait for review

### Important Notes
- ✨ GitHub saves ALL changes and their history
- 🔄 Always pull latest code before starting new work
- 🌿 Create new branch for each feature/fix
- 📝 Write clear descriptions in commits and PRs
- 🚫 Never commit directly to main branch
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