# Ifc 3D Visualization
To set up and run the IFC 3D Visualization project locally, follow these steps:

1. **Install Node.js**  
   Ensure you have Node.js installed on your system. You can download the latest stable version from the [official Node.js website](https://nodejs.org/).  
   - Verify the installation by running the following commands in your terminal:
     ```bash
     node --version
     npm --version
     ```
     This will confirm that Node.js and npm (Node Package Manager) are installed.

2. **Update npm (Optional)**  
   To ensure you have the latest version of npm, run:
     ```bash
     npm install -g npm
     ```
     Verify the updated version:
     ```bash
     npm --version
     ```

3. **Clone the Repository**  
   Pull the project repository
     ```bash
     git clone https://github.com/emmanuelkyeremeh/Ifc-3d-visualization.git
     ```

4. **Navigate to the Project Directory**  
   Change into the project directory:
     ```bash
     cd Ifc-3d-visualization
     ```

5. **Install Dependencies**  
   Install the required dependencies by running:
     ```bash
     npm install
     ```
     This will download and install all the packages listed in `package.json`.

6. **Run the Development Server**  
   Start the Vite development server to run the application locally:
     ```bash
     npm run dev
     ```
     Once the server starts, you should see output in the terminal indicating the local URL (`http://localhost:5173`). Open this URL in your browser to view the application.

7. **Interacting with the Application**  
   - Upload an IFC file through the application's interface.  
   - Use your mouse interact with the 3D visualization of the IFC file.
