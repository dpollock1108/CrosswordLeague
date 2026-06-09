from app.server import app


def main() -> None:
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)


if __name__ == "__main__":
    main()
