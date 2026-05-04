# Parallel (CoHive) — Meet People Moving in Your Direction

Parallel (also known as CoHive) is a modern, real-time social networking and connection application designed to help individuals—such as university students and professionals—meet like-minded people in their city who share similar life stages, goals, and energy styles.

## 🚀 Features

### Seamless Onboarding & Authentication
* **OTP Email Verification**: Secure sign-up process using 6-digit email OTPs powered by Nodemailer and Redis (15-minute expiry).
* **Face Detection**: Client-side photo validation using `face-api.js` ensures users upload real human faces to build a trusted community.
* **Smart Location Search**: Integrated with the Open-Meteo Geocoding API to provide a searchable, standardized city dropdown (no API key required).
* **Life Stage Categorization**: Dynamic onboarding flows tailored for University Students (e.g., Undergrad, Prep for exams) and Professionals (e.g., Tech, Business, Aviation).

### Core Application
* **Smart Discovery Feed**: Swipe-based discovery interface (Like/Pass) that matches users based on city, life stage, and compatibility scores.
* **Mutual Matching**: Real-time matching logic. When two users "like" each other, a mutual match is instantly triggered via Socket.io.
* **Real-Time Chat**: Live messaging interface with online status indicators, typing indicators (`typing...`), and persistent chat history backed by MongoDB.
* **Profile Management**: Users can update their bio, interests, energy style, and toggle a "Recently Relocated" badge to let others know they are new to the city.
* **Community Safety**: Built-in reporting system. Users can report or block inappropriate profiles or chat messages, which automatically triggers a detailed email to the moderation team and scrubs the interaction history from the reporter's view.

## 🛠️ Tech Stack

### Frontend
* **HTML5 / Vanilla CSS3**: Highly optimized, responsive, and beautifully animated UI using custom CSS variables, gradients, and modern typography (`Clash Display`, `Syne`, `Cormorant Garamond`).
* **Vanilla JavaScript**: Lightweight, module-free frontend logic managing state, navigation, API calls, and WebSockets.
* **face-api.js**: For lightweight client-side face detection during photo upload.

### Backend
* **Node.js & Express.js**: Robust backend server and REST API.
* **Socket.io**: Enables real-time bidirectional event-based communication for chats, typing indicators, and mutual likes.
* **MongoDB & Mongoose**: Primary database for persisting users, swipes, mutual matches, and chat histories.
* **Redis**: Ephemeral, high-performance storage for OTP verification codes.
* **Nodemailer**: For sending OTP verification emails and community safety report summaries.

## 📂 Project Structure

```text
parallel-app/
├── public/                 # Static frontend assets
│   ├── css/                # Stylesheets (styles.css)
│   ├── images/             # Static images and logos
│   ├── js/                 # Frontend logic (app.js, chat.js, swipe.js, report.js)
│   └── index.html          # Main application entry point
├── models/                 # Mongoose database schemas (User, Chat, Like, Match, Swipe)
├── data/                   # Seed data, static prompts, and bot profiles
├── models/ (root)          # face-api.js neural network models
├── server.js               # Node.js Express server and Socket.io setup
├── package.json            # Node dependencies and scripts
└── .env                    # Environment variables (not tracked in git)
```

## ⚙️ Local Development Setup

### Prerequisites
* Node.js (v18+ recommended)
* MongoDB Atlas account (or local MongoDB instance)
* Redis server running locally or remotely

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd parallel-app
npm install
```

### 2. Environment Variables
Create a `.env` file in the root directory and configure the following variables:
```env
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/parallel
REDIS_URL=redis://localhost:6379
REPORT_EMAIL_USER=your_email@gmail.com
REPORT_EMAIL_PASS=your_app_password
```

### 3. Start the Application
To run the application in development mode:
```bash
npm run dev
```
Alternatively, to start normally:
```bash
npm start
```

### 4. Access the App
Open your browser and navigate to `http://localhost:3000`.

## 🛡️ Privacy & Security
* Images are compressed client-side and saved as base64 strings to save bandwidth.
* Screenshots and printing are mitigated on the frontend via CSS `obscured` filters and `@media print` rules to protect user privacy.
* The reporting flow ensures quick moderation by automatically emailing context (including chat transcripts) to administrators.

## 📜 License
© 2026 Parallel (CoHive). All rights reserved.