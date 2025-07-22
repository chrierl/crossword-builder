#!/bin/bash

# Shell script to commit and push changes to GitHub, with prompt for commit message

# Check if inside a git repository
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: Not inside a Git repository. Please run this in your project folder."
  exit 1
fi

# Add all modified and new files
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
  echo "No changes to commit."
  exit 0
fi

# Prompt for commit message
echo "Enter commit message (e.g., 'Update clue editing functionality'):"
read -r commit_message

# Validate commit message
if [ -z "$commit_message" ]; then
  echo "Error: Commit message cannot be empty."
  exit 1
fi

# Commit changes
git commit -m "$commit_message"

# Attempt to push to main branch
echo "Pushing to GitHub (branch: main)..."
if git push origin main; then
  echo "Successfully pushed to GitHub!"
else
  echo "Push failed, possibly due to GitHub secret scanning (e.g., PAT in script.js)."
  echo "To bypass for testing:"
  echo "1. Visit the URL provided by GitHub in the error message above (if any)."
  echo "2. Select 'Allow this push for testing' for the blocked commit."
  echo "3. Run 'git push origin main' again."
  echo "Alternatively, re-run this script after bypassing, or use the prompt-based PAT approach to avoid hardcoding."
  exit 1
fi