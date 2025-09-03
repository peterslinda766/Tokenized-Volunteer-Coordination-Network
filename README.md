# 🌍 Tokenized Volunteer Coordination Network

Welcome to a revolutionary platform that empowers global crisis response through blockchain! This Web3 project tackles the real-world problem of inefficient volunteer coordination during disasters—like natural calamities, humanitarian crises, or pandemics—by providing transparent, verifiable logging of volunteer hours, automated rewards via tokens, and decentralized matching of skills to needs. Built on the Stacks blockchain using Clarity smart contracts, it ensures tamper-proof records, incentivizes participation, and fosters trust among volunteers, organizations, and donors worldwide.

## ✨ Features

🌐 Decentralized registration for volunteers and crisis events  
🕒 On-chain logging and verification of volunteer hours  
💰 Token rewards (using a SIP-10 fungible token) based on verified contributions  
🤝 Skill-based task matching and assignment  
📊 Transparent donation pooling and reward distribution  
🗳️ Governance for community-driven updates  
🔒 Multisig verification to prevent fraud  
📈 Analytics for impact tracking and reporting  
🚨 Real-time crisis event creation and coordination  

## 🛠 How It Works

**For Volunteers**  
- Register your profile with skills and availability via the VolunteerRegistry contract.  
- Browse active crisis events and apply for tasks using the TaskManager.  
- Log your hours on-chain through the HoursLogger after completing tasks.  
- Once verified, claim rewards from the RewardDistributor—earn tokens proportional to your hours!  

**For Crisis Organizers (e.g., NGOs or Governments)**  
- Create a new crisis event with details like location, type, and urgency using CrisisEventManager.  
- Post specific tasks and required skills via TaskManager.  
- Verify submitted hours multisig-style with the VerificationContract.  
- Fund rewards by donating to the DonationContract, which pools resources for distribution.  

**For Donors and Supporters**  
- Contribute STX or tokens to the DonationContract to fuel the reward pool.  
- Track impact through on-chain analytics in the AnalyticsContract.  
- Participate in governance votes via the GovernanceContract to influence reward rates or verification rules.  

**For Everyone**  
- Query event details, volunteer stats, or reward balances anytime—everything's immutable and transparent on the blockchain.  
Boom! Coordinated, rewarded, and verifiable global crisis response at scale.

## 📜 Smart Contracts Overview

This project involves 8 Clarity smart contracts for a robust, modular system. Here's a high-level breakdown:

1. **VolunteerRegistry.clar**  
   Handles volunteer onboarding: Registers users with profiles (skills, location, availability). Includes functions for updating profiles and querying active volunteers.

2. **CrisisEventManager.clar**  
   Manages crisis events: Creates new events with metadata (e.g., disaster type, start/end dates). Tracks event status and participants.

3. **TaskManager.clar**  
   Coordinates tasks within events: Allows organizers to post tasks, volunteers to apply/assign, and tracks assignments with skill-matching logic.

4. **HoursLogger.clar**  
   Logs volunteer hours: Submits time entries tied to tasks/events. Ensures only assigned volunteers can log, with basic validation (e.g., no overlaps).

5. **VerificationContract.clar**  
   Verifies logged hours: Uses multisig (e.g., 3-of-5 organizers) to approve/reject submissions. Emits events for approved hours.

6. **RewardToken.clar**  
   SIP-10 fungible token: Defines the reward token (e.g., VOL-TKN) for minting, burning, and transferring based on contributions.

7. **RewardDistributor.clar**  
   Distributes rewards: Calculates and transfers tokens from the pool based on verified hours (e.g., X tokens per hour). Handles claim functions.

8. **DonationContract.clar**  
   Manages funding: Accepts donations in STX/tokens, pools them for rewards, and integrates with governance for allocation rules.

9. **GovernanceContract.clar**  
   Community governance: Token holders vote on parameters like reward multipliers, verification thresholds, or new features.

10. **AnalyticsContract.clar**  
    Provides read-only analytics: Aggregates data like total hours logged, rewards distributed, and event impact metrics for transparency.

These contracts interact seamlessly—e.g., HoursLogger calls VerificationContract, which triggers RewardDistributor. Deploy them on Stacks for secure, Bitcoin-anchored execution!