import urllib.request
import json

test_users = [
    ("superadmin@stayone.com", "StayoneSuperAdmin2026!", "Global SuperAdmin"),
    ("admin.orchid@stayone.com", "StayoneOrchid2026!", "Property Admin (Orchid Trails)"),
    ("admin.wildvilla@stayone.com", "StayoneVilla2026!", "Property Admin (Wild Villa)"),
    ("admin.paradisebay@stayone.com", "StayoneParadise2026!", "Property Admin (Paradise Bay)"),
    ("admin.grandmountain@stayone.com", "StayoneMountain2026!", "Property Admin (Grand Mountain)")
]

for email, password, role_label in test_users:
    req = urllib.request.Request(
        "http://localhost:8011/api/auth/login",
        data=json.dumps({"email": email, "password": password}).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            user = data.get("user", {})
            print(f"SUCCESS: {role_label}")
            print(f"  User: {user.get('name')} | Email: {user.get('email')}")
            print(f"  is_superadmin: {user.get('is_superadmin')} | branch_id: {user.get('branch_id')} | role: {user.get('role_name')}")
            print(f"  Token length: {len(data.get('access_token', ''))}")
            print("-" * 50)
    except Exception as e:
        print(f"FAILED: {role_label} ({email}): {e}")
