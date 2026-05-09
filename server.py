import http.server
import socketserver
import json
import os
import urllib.parse

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DIRECTORY, "data.json")
IMAGES_DIR = os.path.join(DIRECTORY, "..", "FFO_Images")

# Initialize data.json if it doesn't exist
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, "w") as f:
        json.dump({"positions": {}, "changelog": []}, f)

class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Serve images from FFO_Images directory
        if path.startswith("/images/"):
            # Strip /images/ and resolve to FFO_Images
            rel_path = path[len("/images/"):]
            return os.path.join(IMAGES_DIR, urllib.parse.unquote(rel_path))
        # Otherwise serve from current directory
        path = super().translate_path(path)
        return path

    def do_GET(self):
        if self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            with open(DATA_FILE, "r") as f:
                self.wfile.write(f.read().encode())
        elif self.path == '/api/images':
            images = []
            if os.path.exists(IMAGES_DIR):
                for category in os.listdir(IMAGES_DIR):
                    cat_path = os.path.join(IMAGES_DIR, category)
                    if os.path.isdir(cat_path) and category.lower() in ["items", "accesories", "artifacts", "weapons", "augments", "cumulative"]:
                        for file in os.listdir(cat_path):
                            if file.lower().endswith(('.png', '.webp', '.jpg', '.jpeg', '.gif')):
                                name = os.path.splitext(file)[0]
                                images.append({
                                    "id": f"{category}_{name}".replace(" ", "_"),
                                    "name": name,
                                    "category": category,
                                    "url": f"/images/{category}/{urllib.parse.quote(file)}"
                                })
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(images).encode())
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/data':
            # Basic authorization check
            auth_header = self.headers.get('Authorization')
            if auth_header != 'admin123':
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b"Unauthorized")
                return

            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                new_data = json.loads(post_data.decode())
                with open(DATA_FILE, "w") as f:
                    json.dump(new_data, f, indent=4)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode())
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

Handler = MyHttpRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print("Serving at port", PORT)
    httpd.serve_forever()
