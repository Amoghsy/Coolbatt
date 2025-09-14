

---

# 🚀 Welcome to your Expo app

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

---

## 📦 Get started

1. **Install dependencies**

  
   ```bash
   yarn install
   ```

2. **Start the app**

   ```bash
   yarn expo start
   ```

   In the output, you'll find options to open the app in a:

   * [Development build](https://docs.expo.dev/develop/development-builds/introduction/)

   * [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)

   * [Expo Go](https://expo.dev/go)

   > ⚠️ iOS builds are not included since this project is Android-only.

---

## 🔑 Firebase & Security Setup

1. Copy example files and fill in your real values:

   ```bash
   cp app/config/server.example.ts app/config/server.ts
   cp .env.example .env
   cp google-services.json.example google-services.json
   ```

2. Place your **Firebase `google-services.json`** file in:

   ```
   android/app/google-services.json
   ```

3. Generate and register your **SHA keys** in the Firebase console:

   ```bash
   ./gradlew signingReport
   ```

   Run this inside the `android/` folder. Copy both **SHA-1** and **SHA-256** into Firebase Project Settings → Android App.

   👉 Without SHA keys, some Firebase features (like Google sign-in, phone auth, dynamic links) will not work.

---

## 🛠️ Development notes

* The app source lives in the **app/** directory.
* This project uses [file-based routing](https://docs.expo.dev/router/introduction/).
* Sensitive files (`server.ts`, `.env`, `google-services.json`) are **ignored in Git**. Use the provided `*.example` files as templates.

---

## 🧹 Get a fresh project

When you're ready to reset:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example/** directory and create a blank **app/** directory for fresh development.

---

## 📚 Learn more

* [Expo documentation](https://docs.expo.dev/)
* [Expo Guides](https://docs.expo.dev/guides)
* [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/)

---

## 👥 Community

* [Expo on GitHub](https://github.com/expo/expo)
* [Discord community](https://chat.expo.dev)

---

✅ This way your README is safe, informative, and also reminds contributors about **SHA key generation for Firebase**.

---

