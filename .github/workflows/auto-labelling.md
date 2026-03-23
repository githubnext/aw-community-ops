---
name: Label Discussions

on:
  schedule: daily
  workflow_dispatch:
  
permissions:
  contents: read
  discussions: read

steps:
  - uses: actions/github-script@v8
    with:
      github-token: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
      script: |
        const path = require("node:path");
        const { main } = require(path.join(process.env.GITHUB_WORKSPACE, ".github", "scripts", "fetch-community-discussions.js"));
        await main({ core, github, context });

tools:
  github:
    mode: remote
    github-token: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
    toolsets: [discussions, repos]

safe-outputs:
  github-token: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
  allowed-github-references: [community/community-ops]
  create-issue:
    github-token: ${{ secrets.WRITE_TO_COMM_OPS_TOKEN }}
    title-prefix: "[Daily Auto-labelling Summary]"
    close-older-issues: true
    expires: 7d
  update-discussion:
    staged: true
    target: "*"
    target-repo: community/community
    max: 1
    labels:
    allowed-labels:
      - 2FA
      - AI or ML Model
      - API and Webhooks
      - ARC (Actions Runner Controller)
      - Accessibility
      - Account Access
      - Account Related
      - Achievements
      - Actions
      - Actions Cache
      - Actions Checkout
      - Actions Runner
      - Actions Runner Images
      - Android
      - Announcement
      - Best Practices
      - Beta
      - Billing
      - Bug
      - CLI
      - Campus Experts
      - Changelog
      - Classroom
      - Code Scanning
      - Code Search and Navigation
      - Code Security
      - Codespaces
      - Command Palette
      - Community Activity
      - Community Check-In
      - Copilot
      - Copilot Agent Mode
      - Copilot Coding Agent
      - Copilot Enterprise
      - Copilot Workspace
      - Copilot for Business
      - Copilot in GitHub
      - Dependabot
      - DevOps
      - Discussions
      - Docker
      - Docker-in-Docker
      - Documentation
      - Duplicate
      - Education Partnerships
      - "Education: Awaiting Benefits"
      - "Education: Billing Info"
      - "Education: Form Error"
      - "Education: Hackathons/Events"
      - "Education: How to Redeem Benefits"
      - "Education: Image Detection"
      - "Education: Image Resolution"
      - "Education: Re-verifying"
      - "Education: School Verified Email"
      - "Education: Support Request"
      - "Education: Upload Evidence"
      - "Education: Verification Guidance"
      - "Education: Wrong Coupon"
      - Enhancement
      - Enterprise
      - Enterprise Admin
      - Feed
      - Feedback Wanted
      - From Campus to Community
      - GHAS
      - GHEC
      - GHES
      - Gists
      - Git LFS
      - Git and Code
      - GitHub Apps
      - GitHub Certifications
      - GitHub Desktop
      - GitHub Education
      - GitHub Education Benefits
      - GitHub Education Verification
      - GitHub Event
      - "GitHub Skill :up:"
      - GitHub Well-Architected
      - Graduation
      - Help Wanted
      - In Backlog
      - "Incident :exclamation:"
      - Integration
      - Issue Forms
      - Issues
      - JetBrains & Xcode
      - Kubernetes
      - Lists
      - MLOps
      - Machine Learning
      - "Maintainer Love :heart:"
      - Markdown
      - Marketplace
      - Mermaid
      - Metrics
      - Metrics & Insights
      - Misc
      - Mobile
      - Models
      - Monthly Digest
      - More Information Needed
      - Neovim
      - "New To GitHub :wave:"
      - "New User Introduction :wave:"
      - Node
      - Non-Ephemeral Runners
      - Notifications
      - OAuth apps
      - Octernships
      - Opus 4.5 availability
      - Opus 4.5 multiplier update
      - Organizations
      - Packages
      - Page Failure
      - Pages
      - Performance
      - Persistent Storage
      - Product Feedback
      - Profile
      - Programming Help
      - Project Maintenance
      - Projects
      - Proxy Configuration
      - Pull Requests
      - Question
      - Releases
      - Repositories
      - Runner Configuration
      - RunnerDeployment
      - RunnerSet
      - SMS
      - SSO
      - Scale Sets
      - Schedule & Cron Jobs
      - Secret Management
      - Secret Scanning
      - Security Manager
      - Security Overview
      - Security and Privacy
      - Show & Tell
      - Site Flagged
      - Speaker
      - Sponsors
      - Task Lists
      - Temp
      - Transferred
      - Troubleshooting
      - UI/UX
      - Universe 2023
      - Universe 2024
      - Universe 2025
      - Upgrade Process
      - VS Code
      - Visual Studio
      - Web Editor
      - "Welcome :tada:"
      - Wiki
      - Windows Runners
      - Workflow Configuration
      - Workflow Deployment
      - iOS
      - inactive
      - npm
      - ":ear: Feedback Wanted"
      - ":mega: ANNOUNCEMENT"
      - ":rocket: Shipped"
      - "🛣 On the Roadmap"
---
# Auto-labelling Discussions

You have two tasks:

1. You propose label changes using the staged `update-discussion` safe output, but do not apply labels live.
{{#runtime-import .github/instructions/community-discussion-labeling.md}}

2. You report a summary of the discussions you processed in the form of an issue, including how many discussions you would have labeled and any patterns or insights you observed in the discussions.
