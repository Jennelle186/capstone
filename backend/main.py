import uvicorn


if __name__ == "__main__":
    # Local dev entrypoint: serves the app defined in app/api.py.
    uvicorn.run("app.api:app", host="0.0.0.0", port=8000, reload=True)
