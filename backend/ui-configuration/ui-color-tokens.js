"use strict";

const UI_COLOR_TOKEN_TABLE_SQL = `
  CREATE TABLE ui_color_tokens
  (
      token_code     TEXT    PRIMARY KEY,
      palette_family TEXT    NOT NULL,
      shade          INTEGER NOT NULL,
      color_value    TEXT    NOT NULL,
      display_order  INTEGER NOT NULL UNIQUE,
      updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

      CONSTRAINT uq_ui_color_tokens_family_shade
          UNIQUE (palette_family, shade),
      CONSTRAINT chk_ui_color_tokens_code
          CHECK (
              length(token_code) BETWEEN 1 AND 50
              AND token_code = lower(token_code)
              AND token_code NOT GLOB '*[^a-z0-9_]*'
          ),
      CONSTRAINT chk_ui_color_tokens_family
          CHECK (
              palette_family IN
              (
                  'BLUE',
                  'INDIGO',
                  'PURPLE',
                  'PINK',
                  'RED',
                  'ORANGE',
                  'YELLOW',
                  'GREEN',
                  'TEAL',
                  'CYAN',
                  'GRAY'
              )
          ),
      CONSTRAINT chk_ui_color_tokens_shade
          CHECK (shade IN (100, 200, 300, 400, 500, 600, 700, 800, 900)),
      CONSTRAINT chk_ui_color_tokens_value
          CHECK (
              length(color_value) = 7
              AND color_value GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
          ),
      CONSTRAINT chk_ui_color_tokens_order
          CHECK (display_order BETWEEN 0 AND 9999)
  )
`;

function paletteToken(paletteFamily, shade, colorValue, displayOrder) {
  return Object.freeze({
    tokenCode: `${paletteFamily.toLowerCase()}_${shade}`,
    paletteFamily,
    shade,
    colorValue,
    displayOrder
  });
}

const BOOTSTRAP_COLOR_PALETTE = Object.freeze({
  BLUE: Object.freeze(["#CFE2FF", "#9EC5FE", "#6EA8FE", "#3D8BFD", "#0D6EFD", "#0A58CA", "#084298", "#052C65", "#031633"]),
  INDIGO: Object.freeze(["#E0CFFC", "#C29FFA", "#A370F7", "#8540F5", "#6610F2", "#520DC2", "#3D0A91", "#290661", "#140330"]),
  PURPLE: Object.freeze(["#E2D9F3", "#C5B3E6", "#A98EDA", "#8C68CD", "#6F42C1", "#59359A", "#432874", "#2C1A4D", "#160D27"]),
  PINK: Object.freeze(["#F7D6E6", "#EFADCE", "#E685B5", "#DE5C9D", "#D63384", "#AB296A", "#801F4F", "#561435", "#2B0A1A"]),
  RED: Object.freeze(["#F8D7DA", "#F1AEB5", "#EA868F", "#E35D6A", "#DC3545", "#B02A37", "#842029", "#58151C", "#2C0B0E"]),
  ORANGE: Object.freeze(["#FFE5D0", "#FECBA1", "#FEB272", "#FD9843", "#FD7E14", "#CA6510", "#984C0C", "#653208", "#331904"]),
  YELLOW: Object.freeze(["#FFF3CD", "#FFE69C", "#FFDA6A", "#FFCD39", "#FFC107", "#CC9A06", "#997404", "#664D03", "#332701"]),
  GREEN: Object.freeze(["#D1E7DD", "#A3CFBB", "#75B798", "#479F76", "#198754", "#146C43", "#0F5132", "#0A3622", "#051B11"]),
  TEAL: Object.freeze(["#D2F4EA", "#A6E9D5", "#79DFC1", "#4DD4AC", "#20C997", "#1AA179", "#13795B", "#0D503C", "#06281E"]),
  CYAN: Object.freeze(["#CFF4FC", "#9EEAF9", "#6EDFF6", "#3DD5F3", "#0DCAF0", "#0AA2C0", "#087990", "#055160", "#032830"]),
  GRAY: Object.freeze(["#F8F9FA", "#E9ECEF", "#DEE2E6", "#CED4DA", "#ADB5BD", "#6C757D", "#495057", "#343A40", "#212529"])
});

const DEFAULT_UI_COLOR_TOKENS = Object.freeze(
  Object.entries(BOOTSTRAP_COLOR_PALETTE).flatMap(
    ([paletteFamily, colors], familyIndex) => colors.map(
      (colorValue, shadeIndex) => paletteToken(
        paletteFamily,
        (shadeIndex + 1) * 100,
        colorValue,
        (familyIndex * 100) + ((shadeIndex + 1) * 10)
      )
    )
  )
);

module.exports = {
  DEFAULT_UI_COLOR_TOKENS,
  UI_COLOR_TOKEN_TABLE_SQL
};
