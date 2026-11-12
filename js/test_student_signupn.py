import sys
import time
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def run_test():
    ts = int(time.time())
    student_email = f"student_test_{ts}@muj.edu"
    student_name = f"Test Student {ts}"
    password = "password123"
    
    print(f"Student Name: {student_name}")
    print(f"Student Email: {student_email}")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()
        
        def log_console(msg):
            try:
                print(f"CONSOLE: {msg.type}: {msg.text}")
            except Exception:
                pass
            
        def log_error(err):
            try:
                print(f"EXCEPTION: {err}")
            except Exception:
                pass
            
        page.on("console", log_console)
        page.on("pageerror", log_error)
        
        url = "http://127.0.0.1:8000/index.html"
        page.goto(url)
        page.click("#signupBtn")
        page.wait_for_selector("#signupModal.active")
        
        page.fill("#signupName", student_name)
        page.fill("#signupEmail", student_email)
        page.fill("#signupPhone", "8888888888")
        page.fill("#signupCollegeId", "STU456")
        page.fill("#signupBranch", "CSE")
        page.select_option("#signupYear", "2")
        page.fill("#signupPassword", password)
        page.fill("#signupConfirmPassword", password)
        
        print("Clicking Sign Up button...")
        page.click("#signupForm button[type='submit']")
        
        print("Waiting for redirection...")
        page.wait_for_url("**/dashboard.html", timeout=10000)
        print("Redirected to dashboard!")
        
        # Wait a few seconds for async operations
        time.sleep(3)
        
        # Query firestore directly from the page
        user_doc = page.evaluate("""
            async () => {
                if (!currentUser) return { error: "No currentUser found" };
                const doc = await db.collection('users').doc(currentUser.uid).get();
                return { uid: currentUser.uid, exists: doc.exists, data: doc.exists ? doc.data() : null };
            }
        """)
        print(f"Firestore result: {user_doc}")
        
        browser.close()

if __name__ == "__main__":
    run_test()
