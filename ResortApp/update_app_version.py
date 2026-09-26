import argparse
from app.database import SessionLocal
from app.models.settings import SystemSetting

def update_version(min_version=None, play_store_url=None, force_update=None):
    db = SessionLocal()
    try:
        updated = []
        if min_version:
            db_setting = db.query(SystemSetting).filter(
                SystemSetting.key == "mobile_app_min_version",
                SystemSetting.branch_id == None
            ).first()
            if db_setting:
                db_setting.value = min_version
            else:
                db_setting = SystemSetting(
                    key="mobile_app_min_version",
                    value=min_version,
                    description="Minimum mobile app version required (global)",
                    branch_id=None
                )
                db.add(db_setting)
            updated.append(f"mobile_app_min_version -> {min_version}")

        if play_store_url:
            db_setting = db.query(SystemSetting).filter(
                SystemSetting.key == "mobile_app_play_store_url",
                SystemSetting.branch_id == None
            ).first()
            if db_setting:
                db_setting.value = play_store_url
            else:
                db_setting = SystemSetting(
                    key="mobile_app_play_store_url",
                    value=play_store_url,
                    description="Mobile app Play Store URL (global)",
                    branch_id=None
                )
                db.add(db_setting)
            updated.append(f"mobile_app_play_store_url -> {play_store_url}")

        if force_update is not None:
            val = "true" if force_update else "false"
            db_setting = db.query(SystemSetting).filter(
                SystemSetting.key == "mobile_app_force_update",
                SystemSetting.branch_id == None
            ).first()
            if db_setting:
                db_setting.value = val
            else:
                db_setting = SystemSetting(
                    key="mobile_app_force_update",
                    value=val,
                    description="Enforce force update check (global)",
                    branch_id=None
                )
                db.add(db_setting)
            updated.append(f"mobile_app_force_update -> {val}")

        if updated:
            db.commit()
            print("✅ Successfully updated version configuration in database:")
            for item in updated:
                print(f"  - {item}")
        else:
            print("⚠️ No updates specified. Use arguments to update settings.")
    except Exception as e:
        db.rollback()
        print(f"❌ Error updating database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update StayOne Mobile App version configuration in the database.")
    parser.add_argument("--min-version", help="Minimum required mobile app version (e.g. 1.2.2)")
    parser.add_argument("--play-store-url", help="Google Play Store download URL")
    parser.add_argument("--force-update", choices=["true", "false"], help="Enable/disable force update (true/false)")

    args = parser.parse_args()
    
    force_update_bool = None
    if args.force_update:
        force_update_bool = args.force_update == "true"

    if not (args.min_version or args.play_store_url or args.force_update):
        parser.print_help()
    else:
        update_version(
            min_version=args.min_version,
            play_store_url=args.play_store_url,
            force_update=force_update_bool
        )
