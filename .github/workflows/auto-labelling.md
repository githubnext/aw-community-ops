---
name: Label Discussions

on:
  schedule: daily
  workflow_dispatch:
    inputs:
      target-repo:
        description: Discussion repository to read from and update (owner/repo)
        required: false
        type: string
      max-discussions:
        description: Maximum number of discussions to review for this run
        required: false
        type: number
      target-category:
        description: Discussion category slug to review, or all for every category
        required: false
        type: string
        default: all
  
permissions:
  contents: read
  discussions: read

env:
  DEFAULT_TARGET_REPOSITORY: githubnext/aw-community-discussions
  DEFAULT_MAX_DISCUSSIONS: "120"
  DEFAULT_TARGET_CATEGORY: all

steps:
  - uses: actions/github-script@v8
    env:
      # These env vars are consumed by .github/scripts/fetch-community-discussions.js.
      TARGET_REPOSITORY: ${{ inputs.target-repo || env.DEFAULT_TARGET_REPOSITORY }}
      MAX_DISCUSSIONS: ${{ inputs.max-discussions || env.DEFAULT_MAX_DISCUSSIONS }}
      TARGET_CATEGORY: ${{ inputs.target-category || env.DEFAULT_TARGET_CATEGORY }}
    with:
      github-token: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
      script: |
        const path = require("node:path");
        const { main } = require(path.join(process.env.GITHUB_WORKSPACE, ".github", "scripts", "fetch-community-discussions.js"));
        // main() reads TARGET_REPOSITORY, MAX_DISCUSSIONS, and TARGET_CATEGORY from this step environment.
        await main({ core, github, context });

tools:
  github:
    github-token: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
    toolsets: [discussions, repos]

safe-outputs:
  allowed-github-references: [githubnext/aw-community-ops]
  create-issue:
    github-token: ${{ secrets.WRITE_TO_COMM_OPS_TOKEN }}
    title-prefix: "[Daily Auto-labelling Summary]"
    close-older-issues: true
    expires: 7d
  update-discussion:
    github-token: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
    target: "*"
    target-repo: ${{ inputs.target-repo || env.DEFAULT_TARGET_REPOSITORY }}
    max: ${{ inputs.max-discussions || env.DEFAULT_MAX_DISCUSSIONS }}
    labels:
    allowed-labels:
      - 2FA
      - A Welcome to GitHub
      - AI or ML Model
      - API
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
      - App
      - Apps API and Webhooks
      - Benefit Activation/Waiting
      - Best Practices
      - Beta
      - Billing
      - Billing & Payment Issues
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
      - Education Support Request
      - Education Wrong Coupon
      - Enhancement
      - Enterprise
      - Enterprise Admin
      - Evidence and Image Capture
      - Feed
      - Feedback Wanted
      - Form Errors & Technical Issues
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
      - GitHub Learn
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
      - Other
      - Other Features and Feedback
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
      - Re-verification/Repeat Application
      - Redeem Benefits/Offers
      - Releases
      - Repositories
      - Runner Configuration
      - RunnerDeployment
      - RunnerSet
      - SMS
      - SSO
      - Scale Sets
      - Schedule & Cron Jobs
      - School Email/Domain Issues
      - Secret Management
      - Secret Scanning
      - Security Manager
      - Security Overview
      - Security and Privacy
      - Show & Tell
      - Site Flagged
      - Speaker
      - Sponsors
      - Student Events & Hackathons
      - "source:other"
      - "source:ui"
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
      - Verification Help & Guidance
      - Visual Studio
      - Web Editor
      - Webhooks
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
      - ":motorway: On the Roadmap"
---

# Label Discussions

You are an automation that processes recently updated discussions in the target repository. You must:

1. **Apply** missing labels from the allowed label set to each discussion.
2. **Create a summary issue** with the results.

Follow the instructions below.

{{#runtime-import .github/instructions/community-discussion-labeling.md}}
