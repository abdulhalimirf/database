# Advanced People Directory

A full-stack people directory app with:
- Add new profiles with photo upload
- Search and filter by country/profession
- Edit and delete profiles
- Dashboard summary cards
- SQLite database

## Install
npm install

## Run
npm start

Then visit:
http://localhost:3000

## Features
- Collect personal data: name, birth date, profession, education, country, city, bio, status
- Store photos in local uploads folder
- Show all records in modern card layout
- CRUD operations with SQLite

## Project Structure
- `server.js` — main backend logic
- `views/index.ejs` — dashboard
- `views/edit.ejs` — edit page
- `public/styles.css` — styling
- `public/app.js` — frontend behavior
- `uploads/` — uploaded images
- `people.db` — local SQLite DB