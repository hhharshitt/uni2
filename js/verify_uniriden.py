import sys
import time
import random
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def run_test():
    ts = int(time.time())
    driver_name = f"Test Driver {ts}"
    student_name = f"Test Student {ts}"
    driver_email = f"driver_{ts}@muj.edu"
    student_email = f"student_{ts}@muj.edu"
    password = "password123"
    
    print(f"Driver Name: {driver_name}")
    print(f"Student Name: {student_name}")
    print(f"Driver Email: {driver_email}")
    print(f"Student Email: {student_email}")
    
    with sync_playwright() as p:
        # Launch two separate browser instances to simulate driver and student
        print("Launching browsers...")
        browser_driver = p.chromium.launch(headless=True)
        browser_student = p.chromium.launch(headless=True)
        
        ctx_driver = browser_driver.new_context()
        ctx_student = browser_student.new_context()
        
        page_driver = ctx_driver.new_page()
        page_student = ctx_student.new_page()
        
        # Simple logging functions that ignore encoding issues
        def log_driver_console(msg):
            try:
                print(f"DRIVER CONSOLE: {msg.type}: {msg.text}")
            except Exception as e:
                pass

        def log_student_console(msg):
            try:
                print(f"STUDENT CONSOLE: {msg.type}: {msg.text}")
            except Exception as e:
                pass

        def log_driver_error(err):
            try:
                print(f"DRIVER EXCEPTION: {err}")
            except Exception as e:
                pass

        def log_student_error(err):
            try:
                print(f"STUDENT EXCEPTION: {err}")
            except Exception as e:
                pass

        page_driver.on("console", log_driver_console)
        page_student.on("console", log_student_console)
        page_driver.on("pageerror", log_driver_error)
        page_student.on("pageerror", log_student_error)
        
        url = "http://127.0.0.1:8000/index.html"
        
        # --- 1. SIGN UP DRIVER ---
        print("\n--- Signing up Driver ---")
        page_driver.goto(url)
        page_driver.click("#signupBtn")
        page_driver.wait_for_selector("#signupModal.active")
        
        # Select Driver role
        page_driver.click(".role-card:has-text('Driver')")
        page_driver.wait_for_selector("#vehicleInfoGroup", state="visible")

        
        page_driver.fill("#signupName", driver_name)
        page_driver.fill("#signupEmail", driver_email)
        page_driver.fill("#signupPhone", "9876543210")
        page_driver.fill("#signupVehicle", "Yellow Auto Rickshaw, RJ14AB1234")
        page_driver.fill("#signupPassword", password)
        page_driver.fill("#signupConfirmPassword", password)
        
        page_driver.click("#signupForm button[type='submit']")
        page_driver.wait_for_url("**/dashboard.html")
        print("Driver signed up and redirected to dashboard successfully!")
        
        # --- 2. SIGN UP STUDENT ---
        print("\n--- Signing up Student ---")
        page_student.goto(url)
        page_student.click("#signupBtn")
        page_student.wait_for_selector("#signupModal.active")
        
        # Select Student role (default)
        page_student.fill("#signupName", student_name)
        page_student.fill("#signupEmail", student_email)
        page_student.fill("#signupPhone", "8888888888")
        page_student.fill("#signupCollegeId", "STU456")
        page_student.fill("#signupBranch", "CSE")
        page_student.select_option("#signupYear", "2")
        page_student.fill("#signupPassword", password)
        page_student.fill("#signupConfirmPassword", password)
        
        page_student.click("#signupForm button[type='submit']")
        page_student.wait_for_url("**/dashboard.html")
        print("Student signed up and redirected to dashboard successfully!")
        
        # --- 3. DRIVER POSTS A RIDE ---
        print("\n--- Driver Posting a Ride ---")
        page_driver.click("a[data-section='post']")
        page_driver.wait_for_selector("#postSection.active")
        
        page_driver.fill("#rideFrom", "Manipal University Jaipur")
        page_driver.fill("#rideTo", "Jaipur Railway Station")
        
        # Set date to tomorrow
        tomorrow = time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400))
        page_driver.fill("#rideDate", tomorrow)
        page_driver.fill("#rideTime", "10:00")
        page_driver.fill("#rideSeats", "3")
        page_driver.fill("#rideFare", "300")
        
        page_driver.click("#postRideForm button[type='submit']")
        print("Ride posted by driver.")
        
        # --- 4. STUDENT SEARCHES & REQUESTS RIDE ---
        print("\n--- Student Searching and Requesting Ride ---")
        page_student.click("a[data-section='search']")
        page_student.wait_for_selector("#searchSection.active")
        
        page_student.fill("#searchDestination", "Jaipur Railway Station")
        page_student.fill("#searchDate", tomorrow)
        page_student.click("#searchRidesBtn")
        
        # Wait for search results and request seat
        page_student.wait_for_selector("#searchResults .ride-card", state="visible")
        print("Ride found in search results.")
        
        # Diagnostics: print searchResults HTML and student state
        html_content = page_student.inner_html("#searchResults")
        print(f"DIAGNOSTICS - #searchResults HTML:\n{html_content}")
        
        student_role_info = page_student.evaluate("""
            () => ({
                uid: currentUser ? currentUser.uid : null,
                role: typeof userRole !== 'undefined' ? userRole : null,
                data: currentUserData
            })
        """)
        print(f"DIAGNOSTICS - Student Client state: {student_role_info}")

        # Intercept confirm dialog
        page_student.on("dialog", lambda dialog: dialog.accept())
        page_student.click(f"#searchResults .ride-card:has-text('{driver_name}') button")
        print("Seat requested by Student.")
        
        # Diagnostics: Print current bookings and driver status
        time.sleep(2)
        bookings_info = page_student.evaluate("""
            async () => {
                const snap = await db.collection('bookings').get();
                return snap.docs.map(doc => ({ id: doc.id, data: doc.data() }));
            }
        """)
        print("DIAGNOSTICS - Firestore Bookings:")
        for b in bookings_info:
            print(f"  Booking ID: {b['id']}, Data: {b['data']}")
            
        driver_info = page_driver.evaluate("""
            () => ({
                uid: currentUser ? currentUser.uid : null,
                role: typeof userRole !== 'undefined' ? userRole : null
            })
        """)
        print(f"DIAGNOSTICS - Driver Client state: {driver_info}")
        
        # --- 5. DRIVER DECLINES / REJECTS RIDE ---
        print("\n--- Driver Declines Request ---")
        # Wait for modal request
        page_driver.wait_for_selector("#driverRequestModal", timeout=10000)
        print("New Ride Request Modal popped up on Driver dashboard.")
        
        # Intercept confirm dialog on accept/reject
        def handle_driver_dialog(dialog):
            print(f"DRIVER DIALOG: {dialog.message}")
            dialog.accept()
        page_driver.on("dialog", handle_driver_dialog)
        
        # Click Decline
        page_driver.click("#driverRequestModal button:has-text('Decline')")
        print("Driver declined the request.")
        
        # Wait and verify passenger toast message
        print("Checking student toast notification...")
        toast_selector = "div:has-text('1 rider have cancelled the ride')"
        page_student.wait_for_selector(toast_selector, timeout=10000)
        print("PASS: Toast '1 rider have cancelled the ride' successfully received by student!")
        
        # --- 6. STUDENT REQUESTS SEAT AGAIN ---
        print("\n--- Student Requests Seat Again ---")
        # Refresh search to make request button available again
        page_student.click("#searchRidesBtn")
        page_student.wait_for_selector("#searchResults .ride-card", state="visible")
        page_student.click(f"#searchResults .ride-card:has-text('{driver_name}') button")
        print("Seat requested again.")
        
        # --- 7. DRIVER ACCEPTS RIDE ---
        print("\n--- Driver Accepts Request ---")
        page_driver.wait_for_selector("#driverRequestModal", timeout=10000)
        page_driver.click("#driverRequestModal button:has-text('Accept')")
        print("Driver accepted the request.")
        
        # --- 8. LIVE MAP & SIMULATION ---
        print("\n--- Verifying Live Tracking Map and Simulation ---")
        # Map should be visible on both sides
        page_driver.wait_for_selector("#activeRideMapCard", state="visible", timeout=10000)
        page_student.wait_for_selector("#activeRideMapCard", state="visible", timeout=10000)
        print("Map card is visible on both driver and student dashboards.")
        
        # Speed up simulation to 50x on Driver's side
        page_driver.click("#map-simulation-controls button:has-text('50x')")
        print("Simulation speed set to 50x.")
        
        # Wait for status to change to ARRIVED on Passenger's side
        print("Waiting for driver to arrive at pickup location...")
        passenger_start_btn = "#passengerStartJourneyBtn"
        page_student.wait_for_selector(passenger_start_btn, state="visible", timeout=30000)
        print("Driver arrived! 'Start Journey' button is now visible to student.")
        
        # --- 9. START JOURNEY ---
        print("\n--- Starting Journey ---")
        page_student.click(passenger_start_btn)
        print("Student started the journey.")
        
        # Wait for simulation to complete the journey
        print("Waiting for journey to complete...")
        completion_toast = "div:has-text('Journey completed successfully')"
        page_driver.wait_for_selector(completion_toast, timeout=30000)
        print("PASS: Journey completed successfully!")
        
        # Clean up browser
        browser_driver.close()
        browser_student.close()
        
    print("\nAll integration checks passed successfully!")

if __name__ == "__main__":
    try:
        run_test()
        sys.exit(0)
    except Exception as e:
        print(f"FAIL: {e}")
        sys.exit(1)
