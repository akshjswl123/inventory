/* ==========================================================================
   UNIFIED CATALOG CONFIGURATION (Inventory In, Out & Recipe Maker)
   ========================================================================== */

/* --- 1. VENDORS & CATEGORIES --- */
const VENDORS_CSV = `
vendor1, vendor2, vendor3, vendor4, other1, other2
`;

const CATEGORIES_CSV = `
category1, category2, category3
`;

/* --- 2. ALLOWED ITEMS PER VENDOR / CATEGORY ("All" = every item) --- */
const VENDOR_ITEMS_CSV = `
vendor1, computer, pen, paper
vendor2, paper, pen, eraser
vendor3, All
vendor4, All
other1, All
other2, All
`;

const CATEGORY_ITEMS_CSV = `
category1, computer, pen, paper
category2, paper, pen, eraser
category3, All
`;

/* --- 3. MASTER CATALOG: itemname, pgNo --- */
const CATALOG_CSV = `
computer, 1
eraser, 2A
pen, 3
paper, 4
`;

/* --- 4. SCOOP IN (Rates) & SCOOP OUT (Default Qty) CONFIGURATIONS --- */
const SCOOP_IN_CSV = `
computer, 2PieceScoop, 45000
computer, 3PieceScoop, 46500
eraser, 1PieceScoop, 5
eraser, 2PieceScoop, 9
pen, 1PieceScoop, 10
pen, 5PieceScoop, 45
paper, BulkScoop, 250
`;

const SCOOP_OUT_CSV = `
computer, 2PieceScoop, 1
computer, 3PieceScoop, 1
eraser, 1PieceScoop, 1
eraser, 2PieceScoop, 1
pen, 1PieceScoop, 1
pen, 5PieceScoop, 1
paper, BulkScoop, 1
`;

/* --- 5. SCOOP INVENTORY (1-to-1 mapping with itemname) --- */
const SCOOP_INVENTORY_CSV = `
computer, Box
eraser, Packet
pen, Box
paper, Ream
`;

/* --- 6. RECIPE MAKER CONFIGURATIONS --- */
const DISHNAME_CSV = `
Classic Burger, Cheese Pizza, Club Sandwich, Pasta Alfredo
`;

const DISH_OUT_SCOOP_CSV = `
Classic Burger, 1 Burger Portion
Classic Burger, Double Burger Portion
Cheese Pizza, 8 Slices Whole
Cheese Pizza, 4 Slices Half
Club Sandwich, 4 Triangle Cut
Pasta Alfredo, 1 Single Bowl
`;

const RECIPE_CATALOG_CSV = `
Burger Bun, R-01
Beef Patty, R-02
Cheddar Cheese Slice, R-03
Lettuce, R-04
Pizza Dough, R-05
Mozzarella Cheese, R-06
Pizza Sauce, R-07
Sandwich Bread, R-08
`;

const RECIPE_SCOOP_CSV = `
Burger Bun, 1 Piece
Beef Patty, 1 Patty
Beef Patty, 2 Patty Scoop
Cheddar Cheese Slice, 1 Slice
Cheddar Cheese Slice, 2 Slice Scoop
Lettuce, 20g Portion
Pizza Dough, 1 Base
Mozzarella Cheese, 100g Scoop
Mozzarella Cheese, 150g Scoop
Pizza Sauce, 50ml Scoop
Sandwich Bread, 2 Slices
`;