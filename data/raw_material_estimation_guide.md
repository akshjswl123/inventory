# Raw Material Estimator & Recursive Calculation Guide

This guide explains how to calculate direct raw materials, intermediate processed items, and recursively resolved base raw materials for dishes with multi-tiered sub-recipes.

---

## Example Scenario

- **Dish Name:** `BUTTER TANDOORI ROTI` (Code: `D074`)
- **Order Quantity:** `2`

---

## 1. Primary Recipe Data Structure

### Main Dish: `BUTTER TANDOORI ROTI` (Code: `D074`)

| dishname | dishcode | reciepeItemname | pgNo | receipescoop | qty | inGm | inML | inPiece | comments | is_usable_in_other_dish | usable_processed_scoop | qtyOfScoops |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BUTTER TANDOORI ROTI | D074 | amul butter | 72 | amul butter_gm_reciepe | 5 | | | | | | | |
| BUTTER TANDOORI ROTI | D074 | AATA PROCESSED | P8 | AATA PROCESSED_gm_reciepe | 80 | | | | | | | |
| BUTTER TANDOORI ROTI | D074 | totalingredientsqty | | | 5 | | | | | | | |
| BUTTER TANDOORI ROTI | D074 | totalprocessedqty | | | 80 | | | | | | | |
| BUTTER TANDOORI ROTI | D074 | dish_out | | BUTTER TANDOORI ROTI_1_portion | | 0 | 0 | 0 | | false | | |

### Processed Sub-Recipe: `AATA PROCESSED` (Code: `P8`)

| dishname | dishcode | reciepeItemname | pgNo | receipescoop | qty | inGm | inML | inPiece | comments | is_usable_in_other_dish | usable_processed_scoop | qtyOfScoops |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AATA PROCESSED | P8 | aaata | 1 | aaata_kg_reciepe | 1 | | | | | | | |
| AATA PROCESSED | P8 | totalingredientsqty | | | 1 | | | | | | | |
| AATA PROCESSED | P8 | totalprocessedqty | | | 1 | | | | | | | |
| AATA PROCESSED | P8 | dish_out | | AATA PROCESSED_gm_reciepe | 3000 | 3000 | | | | true | AATA PROCESSED_gm_reciepe | 3000 |

---

## 2. Calculation Breakdown for Order Qty = 2

### Section 1: Direct Raw Materials (Per Dish)

$$\text{Direct Raw Material Qty} = \text{Recipe Base Qty} \times \text{Order Qty}$$

* **`amul butter`** (pgNo: 72):
  $$5\text{ gm} \times 2 = \mathbf{10\text{ gm}}$$

---

### Section 2: Processed Items Required (Per Dish)

$$\text{Processed Item Qty} = \text{Recipe Base Qty} \times \text{Order Qty}$$

* **`AATA PROCESSED`** (Code: P8):
  $$80\text{ gm} \times 2 = \mathbf{160\text{ gm}}$$

---

### Section 3: Recursive Raw Material Breakdown (Resolving Processed Sub-Recipes)

To resolve processed items into their original raw material components:

1. **Calculate the Yield Scaling Ratio ($R$):**
   $$R = \frac{\text{Total Processed Item Needed}}{\text{Sub-Recipe Output Batch Yield (\texttt{dish\_out})}}$$

2. **Compute Final Base Ingredient Quantity:**
   $$\text{Final Material Qty} = \text{Ingredient Base Qty in Sub-Recipe} \times R$$

#### Calculation for `AATA PROCESSED` (P8):
* **Required Processed Quantity:** $160\text{ gm}$
* **Sub-Recipe Batch Output Yield (`dish_out` -> `inGm`):** $3000\text{ gm}$
* **Scaling Ratio ($R$):**
  $$R = \frac{160\text{ gm}}{3000\text{ gm}} = 0.053333$$

* **Raw Ingredient Calculation (`aaata`):**
  - Base Recipe Quantity: $1\text{ kg} = 1000\text{ gm}$
  - Final Quantity:
    $$1000\text{ gm} \times \left(\frac{160}{3000}\right) = \mathbf{53.33\text{ gm}} \quad (0.05333\text{ kg})$$

---

## 3. Consolidated Raw Material Summary

| Raw Material | Source Type | Original Recipe Unit | Calculated Quantity (gm) | Calculated Quantity (kg) |
| :--- | :--- | :--- | :---: | :---: |
| **`amul butter`** | Direct Dish (`D074`) | $5\text{ gm}$ | **10.00 gm** | $0.010\text{ kg}$ |
| **`aaata`** | Sub-Recipe (`P8` via `D074`) | $1\text{ kg}$ | **53.33 gm** | $0.05333\text{ kg}$ |
