"""Generate social media banner for МедКлиника на Гагарина opening announcement."""

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO_PATH = ROOT / "public" / "assets" / "logo.png"
OUTPUT_PATH = ROOT / "public" / "assets" / "banner-opening.png"

WIDTH, HEIGHT = 1080, 1080
PRIMARY = (0, 168, 168)
PRIMARY_LIGHT = (214, 248, 245)
TEXT = (45, 55, 65)
WHITE = (255, 255, 255)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        [
            r"C:\Windows\Fonts\Montserrat-Bold.ttf",
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
        ]
        if bold
        else [
            r"C:\Windows\Fonts\Montserrat-Regular.ttf",
            r"C:\Windows\Fonts\Montserrat-Medium.ttf",
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ]
    )
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def wrap_text(draw, text, font, max_width):
    words = text.split()
    lines = []
    current = []
    for word in words:
        test = " ".join(current + [word])
        if draw.textbbox((0, 0), test, font=font)[2] <= max_width:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines


def crop_white_margin(image):
    background = Image.new("RGBA", image.size, (255, 255, 255, 255))
    bbox = ImageChops.difference(image, background).getbbox()
    return image.crop(bbox) if bbox else image


def draw_centered_text(draw, y, text, font, fill, max_width=None):
    lines = wrap_text(draw, text, font, max_width) if max_width else [text]
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(((WIDTH - tw) // 2, y), line, font=font, fill=fill)
        y += th + 10
    return y


def draw_chips(draw, chips, y, font):
    gap = 12
    row_gap = 12
    max_row_width = WIDTH - 112
    rows = []
    row = []
    row_width = 0
    for chip in chips:
        bbox = draw.textbbox((0, 0), chip, font=font)
        chip_w = bbox[2] - bbox[0] + 28
        chip_h = bbox[3] - bbox[1] + 16
        if row and row_width + gap + chip_w > max_row_width:
            rows.append((row, chip_h))
            row = []
            row_width = 0
        row.append((chip, chip_w, chip_h))
        row_width += (gap if row_width else 0) + chip_w
    if row:
        rows.append((row, chip_h))

    for row, chip_h in rows:
        total_w = sum(w for _, w, _ in row) + gap * (len(row) - 1)
        x = (WIDTH - total_w) // 2
        for chip, chip_w, _ in row:
            draw.rounded_rectangle((x, y, x + chip_w, y + chip_h), radius=chip_h // 2, fill=PRIMARY_LIGHT)
            bbox = draw.textbbox((0, 0), chip, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            draw.text((x + (chip_w - tw) // 2, y + (chip_h - th) // 2 - 2), chip, font=font, fill=PRIMARY)
            x += chip_w + gap
        y += chip_h + row_gap
    return y


def main():
    img = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)

    gradient_top = (211, 250, 245)
    gradient_bottom = (79, 207, 211)
    for y_pos in range(HEIGHT):
        ratio = y_pos / HEIGHT
        r = int(gradient_top[0] * (1 - ratio) + gradient_bottom[0] * ratio)
        g = int(gradient_top[1] * (1 - ratio) + gradient_bottom[1] * ratio)
        b = int(gradient_top[2] * (1 - ratio) + gradient_bottom[2] * ratio)
        draw.line([(0, y_pos), (WIDTH, y_pos)], fill=(r, g, b))

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    odraw.ellipse((-180, -120, 370, 430), fill=(0, 168, 168, 55))
    odraw.ellipse((720, 900, 1240, 1420), fill=(0, 120, 160, 48))
    odraw.ellipse((790, -80, 1160, 290), fill=(255, 255, 255, 75))
    odraw.polygon(((0, 740), (1080, 510), (1080, 700), (0, 930)), fill=(255, 255, 255, 30))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    draw.rectangle((0, 0, WIDTH, 10), fill=PRIMARY)

    title_font = load_font(50, bold=True)
    title = "Открытие новой клиники!"
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]
    badge_pad_x, badge_pad_y = 28, 14
    badge_y0 = 28
    badge_x0 = (WIDTH - title_w) // 2 - badge_pad_x
    badge_x1 = (WIDTH + title_w) // 2 + badge_pad_x
    badge_y1 = badge_y0 + title_h + badge_pad_y * 2
    draw.rounded_rectangle((badge_x0, badge_y0, badge_x1, badge_y1), radius=16, fill=PRIMARY)
    draw.text(
        ((WIDTH - title_w) // 2, badge_y0 + badge_pad_y - 4),
        title,
        font=title_font,
        fill=WHITE,
    )

    logo = crop_white_margin(Image.open(LOGO_PATH).convert("RGBA"))
    logo_w = 300
    logo_h = int(logo.height * (logo_w / logo.width))
    logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    logo_pad = 22
    logo_x = (WIDTH - logo_w) // 2
    logo_y = badge_y1 + 18
    draw.rounded_rectangle(
        (
            logo_x - logo_pad,
            logo_y,
            logo_x + logo_w + logo_pad,
            logo_y + logo_h + logo_pad * 2,
        ),
        radius=28,
        fill=WHITE,
    )
    img.paste(logo, (logo_x, logo_y + logo_pad), logo)

    y = logo_y + logo_h + logo_pad * 2 + 18

    subtitle_font = load_font(32, bold=True)
    body_font = load_font(27)
    chip_font = load_font(22, bold=True)
    contact_font = load_font(30, bold=True)
    contact_sub_font = load_font(26)

    y = draw_centered_text(draw, y, "Качественная медицинская помощь еще ближе.", subtitle_font, TEXT)
    y += 8
    y = draw_centered_text(draw, y, "Опытные врачи, современное оборудование.", subtitle_font, TEXT)
    y += 12

    invitro_font = load_font(29, bold=True)
    invitro_text = "Лабораторная диагностика от ИНВИТРО"
    invitro_bbox = draw.textbbox((0, 0), invitro_text, font=invitro_font)
    invitro_w = invitro_bbox[2] - invitro_bbox[0]
    invitro_h = invitro_bbox[3] - invitro_bbox[1]
    invitro_y1 = y + invitro_h + 22
    draw.rounded_rectangle(
        ((WIDTH - invitro_w) // 2 - 22, y, (WIDTH + invitro_w) // 2 + 22, invitro_y1),
        radius=15,
        fill=WHITE,
        outline=PRIMARY,
        width=2,
    )
    draw.text(((WIDTH - invitro_w) // 2, y + 7), invitro_text, font=invitro_font, fill=PRIMARY)
    y = invitro_y1 + 14

    card_margin = 56
    card_x0, card_x1 = card_margin, WIDTH - card_margin
    card_y0 = y
    services_text = (
        "Кардиолог, хирург, гинеколог, терапевт, уролог, флеболог на приёмах, "
        "УЗИ-диагностика в «МедКлинике на Гагарина» (ранее Инвитро)."
    )
    lines = wrap_text(draw, services_text, body_font, card_x1 - card_x0 - 48)
    card_h = 48 + len(lines) * 38 + 24
    draw.rounded_rectangle((card_x0, card_y0, card_x1, card_y0 + card_h), radius=20, fill=WHITE)
    draw.rounded_rectangle((card_x0, card_y0, card_x1, card_y0 + card_h), radius=20, outline=PRIMARY, width=2)
    draw.rounded_rectangle((card_x0, card_y0 + 16, card_x0 + 8, card_y0 + card_h - 16), radius=4, fill=PRIMARY)

    text_y = card_y0 + 28
    for line in lines:
        draw.text((card_x0 + 36, text_y), line, font=body_font, fill=TEXT)
        text_y += 38

    y = card_y0 + card_h + 24
    chips = ["Кардиолог", "Хирург", "Гинеколог", "Терапевт", "Уролог", "Флеболог", "УЗИ"]
    y = draw_chips(draw, chips, y, chip_font) + 18

    footer_y0 = y
    footer_h = HEIGHT - footer_y0 - 24
    draw.rounded_rectangle((56, footer_y0, WIDTH - 56, footer_y0 + footer_h), radius=24, fill=PRIMARY)

    # Large watermark fills the contact area without competing with the text.
    mark_size = min(270, footer_h - 70)
    mark_x = WIDTH - 56 - mark_size - 34
    mark_y = footer_y0 + (footer_h - mark_size) // 2
    draw.ellipse(
        (mark_x, mark_y, mark_x + mark_size, mark_y + mark_size),
        fill=(31, 184, 184),
    )
    cross_w = mark_size // 5
    cross_len = mark_size // 2
    cx = mark_x + mark_size // 2
    cy = mark_y + mark_size // 2
    draw.rounded_rectangle(
        (cx - cross_w // 2, cy - cross_len // 2, cx + cross_w // 2, cy + cross_len // 2),
        radius=cross_w // 3,
        fill=(157, 231, 229),
    )
    draw.rounded_rectangle(
        (cx - cross_len // 2, cy - cross_w // 2, cx + cross_len // 2, cy + cross_w // 2),
        radius=cross_w // 3,
        fill=(157, 231, 229),
    )

    footer_title_font = load_font(30, bold=True)
    info_x = 94
    info_y = footer_y0 + 14
    draw.text((info_x, info_y), "ЖДЁМ ВАС!", font=footer_title_font, fill=WHITE)

    info_y += 45
    address_font = load_font(23, bold=True)
    address_text = "\u041a\u0438\u0440\u0436\u0430\u0447, \u0443\u043b. \u0413\u0430\u0433\u0430\u0440\u0438\u043d\u0430, 37"
    address_bbox = draw.textbbox((0, 0), address_text, font=address_font)
    address_w = address_bbox[2] - address_bbox[0]
    address_h = address_bbox[3] - address_bbox[1]
    draw.rounded_rectangle(
        (info_x - 10, info_y - 5, info_x + address_w + 14, info_y + address_h + 8),
        radius=11,
        fill=WHITE,
    )
    draw.text((info_x, info_y - 1), address_text, font=address_font, fill=(0, 112, 120))

    info_y += 42
    phone_font = load_font(32, bold=True)
    phone_text = "8-920-620-23-86"
    phone_bbox = draw.textbbox((0, 0), phone_text, font=phone_font)
    phone_w = phone_bbox[2] - phone_bbox[0]
    phone_h = phone_bbox[3] - phone_bbox[1]
    draw.rounded_rectangle(
        (info_x - 12, info_y - 7, info_x + phone_w + 18, info_y + phone_h + 12),
        radius=14,
        fill=(255, 241, 112),
    )
    draw.text((info_x, info_y - 2), phone_text, font=phone_font, fill=(0, 112, 120))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUTPUT_PATH, quality=95)
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
