# **Lift Mobile App — Launch Master Plan & Timeline**

**Project Manager:** Mobile Launch Expert  
**App Profile:** Lift — Ski area conditions optimization engine  
**Document Intent:** This document maps out the phased engineering, review, testing, and deployment schedule required to smoothly launch Lift on Apple TestFlight, Google Play Console (Closed Testing), and navigate the App Store and Google Play approval processes for a successful public rollout.

## ---

**1\. Launch Strategy Overview**

To ensure maximum stability and strong initial store reviews, Lift will follow a strict phased deployment pipeline. Moving from an integrated code repo to production requires mitigating major bottlenecks early—specifically Apple's Human Interface Guidelines (HIG) checks, App Store Review Guidelines (Section 2.1 Performance), and Google's 20-tester requirement for personal accounts.

| Phase | Target Window | Audience Scope | Core Objective   |
| :---- | :---- | :---- | :---- |
| **Phase 1: Alpha Core** | June – July | Internal Developers | Feature freeze, API stability, performance profiling. |
| **Phase 2: Beta Prep & Sandbox** | August – September | Store Reviewers / Alpha Testers | Build submission to Apple/Google. Clear approval roadblocks. |
| **Phase 3: Friends & Family** | October – November | 100–200 Soft Launch Users | Validate live climate data ingestion, push notifications, and UI load. |
| **Phase 4: Public General Availability** | December | Global Public Launch | App Store & Play Store discovery optimization (ASO), scaling. |

## ---

**2\. Comprehensive Phased Timeline**

### **Phase 1: Stabilization & Infrastructure Foundation (June 1 – July 31\)**

* **Infrastructure Account Verification:** Complete entity verification on Apple Developer Program and Google Play Console. (Ensure D-U-N-S numbers match corporate filings perfectly to avoid multi-week verification freezes).  
* **Data Pipeline Hardening:** Stress-test real-time snow condition API aggregators. Implement local caching strategies so the app gracefully degrades if resort data feeds drop.  
* **Feature Freeze (July 15):** Halt active feature iteration. Lock core UI/UX architecture to dedicate the remaining time to optimization, crash resolution, and asset optimization.

### **Phase 2: Store Build Submission & Review Defuse (August 1 – September 30\)**

* **Store Metadata & ASO Readiness (August 15):** Finalize app descriptions, privacy policies, keywords, and multi-resolution promotional screenshots across matching device viewports.  
* **First Review Build Targets (September 1):** Submit initial builds to Apple App Store Connect and Google Play Console.  
  * *Strategy Point:* We deliberately submit early to handle inevitable baseline rejections (e.g., Apple Guideline 2.1 missing demo credentials, or obscure OAuth compliance queries).  
* **Google 20-Tester Closed Beta Track:** Initiate Google's mandatory 20-tester track running concurrently for 14 continuous days.

### **Phase 3: Friends & Family Soft Launch (October 1 – November 30\)**

* **Distribution Management:** Distribute the approved, live production build via TestFlight external groups and Google Play Closed Production tracks to internal circles.  
* **Real-world Reliability Runs:** Validate the core recommendation loop under true seasonal pre-winter logic. Monitor backend server workloads and telemetry dashboards.

### **Phase 4: Public Production Launch (December 1 onwards)**

* **Flip the Production Switch:** Progressively roll out public builds (e.g., 10% incremental release tracks over 7 days on Google Play, immediate or timed launch release on iOS).  
* **Production Optimization:** Initiate post-launch App Store Optimization (ASO) iteration based on production search impressions.

## ---

**3\. Critical Milestone Checklists**

### **Apple App Store Submission Requirements**

* App Store Connect Account active and team configurations complete.  
* Active, valid URLs for Privacy Policy and Terms of Service hosted externally.  

### **Google Play Store Submission Requirements**

* Google Play Console Account verified with valid merchant profiles for any future monetization.  
* Data Safety Questionnaire completed and cross-referenced accurately with privacy policy language.  
* Full implementation of Android 13+ runtime notification permission prompts.  
* 14-day continuous interaction verification checklist checked and confirmed for the 20-tester limit.
