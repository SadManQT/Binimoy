# Lenden Prohori — Auth Testing Playbook

The app supports TWO sign-in methods that share one `users` collection:
1. **Email/password** (bcrypt + JWT access token in httpOnly `access_token` cookie).
2. **Emergent Google OAuth** (session_token in httpOnly `session_token` cookie, stored in `user_sessions`).

`get_current_user` accepts (in order): `session_token` cookie → `access_token` cookie → `Authorization: Bearer <token>` (works for BOTH a session_token and a JWT).

## Seeded accounts (email/password)
- admin@lendenprohori.com / Admin@12345  (role: admin — also reviewer + moderator powers)
- reviewer@lendenprohori.com / Review@12345 (role: reviewer)
- buyer@lendenprohori.com / Buyer@12345 (role: user)
- seller@lendenprohori.com / Seller@12345 (role: user)

## API testing (email/password)
```
curl -c cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@lendenprohori.com","password":"Admin@12345"}'
curl -b cookies.txt http://localhost:8001/api/auth/me
```
Login returns the user object and sets the `access_token` cookie. `/me` returns the same user.

## Browser testing (Google session) — create a synthetic session
```
mongosh --eval "
use('test_database');
var userId = 'user_testsess01';
db.users.updateOne({user_id:userId},{\$set:{user_id:userId,email:'test.google@example.com',name:'Test Google',role:'user',created_at:new Date()}},{upsert:true});
db.user_sessions.insertOne({user_id:userId,session_token:'test_session_abc',expires_at:new Date(Date.now()+7*24*3600*1000).toISOString(),created_at:new Date()});
"
```
Then set cookie `session_token=test_session_abc` (secure, sameSite None) and load the app, OR call with `Authorization: Bearer test_session_abc`.

## Checklist
- bcrypt hash starts with `$2b$`
- users.email unique index exists
- `/api/auth/me` returns user (not 401) for both a JWT cookie and a Bearer session_token
- Protected endpoints (e.g. `/api/deals`) return 401 without auth, data with auth
