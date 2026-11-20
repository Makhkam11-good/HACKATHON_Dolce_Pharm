"""Генерирует PNG-иконки PWA без внешних библиотек (зелёный фон + белый «плюс»-крест аптеки)."""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"
GREEN = (31, 111, 92)
WHITE = (255, 255, 255)


def png(path: Path, size: int, maskable: bool):
    radius = 0 if maskable else size * 0.22
    arm = size * (0.13 if maskable else 0.16)  # полуширина перекладины
    length = size * (0.28 if maskable else 0.34)
    c = size / 2
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # скруглённый квадрат
            inside = True
            if radius:
                dx = max(radius - x, 0, x - (size - 1 - radius))
                dy = max(radius - y, 0, y - (size - 1 - radius))
                inside = dx * dx + dy * dy <= radius * radius
            if not inside:
                row += bytes((0, 0, 0, 0))
                continue
            in_cross = (abs(x - c) <= arm and abs(y - c) <= length) or (abs(y - c) <= arm and abs(x - c) <= length)
            r, g, b = WHITE if in_cross else GREEN
            row += bytes((r, g, b, 255))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(t, data):
        return struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    path.write_bytes(data)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    png(OUT / "icon-192.png", 192, False)
    png(OUT / "icon-512.png", 512, False)
    png(OUT / "maskable-512.png", 512, True)
    (OUT / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1f6f5c"/>'
        '<path d="M27 12h10v15h15v10H37v15H27V37H12V27h15z" fill="#fff"/></svg>', encoding="utf-8")
    print("icons ->", OUT)
