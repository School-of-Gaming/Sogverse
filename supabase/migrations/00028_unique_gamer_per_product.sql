-- Migration: Enforce one enrollment per gamer per product
-- Description: Prevent a gamer from being enrolled in multiple groups within
--              the same product. Uses a trigger since the constraint spans two
--              tables (group_enrollments → product_groups).

CREATE OR REPLACE FUNCTION check_unique_gamer_per_product()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
BEGIN
  -- Look up the product for the target group
  SELECT product_id INTO v_product_id
    FROM product_groups
   WHERE id = NEW.group_id;

  -- Check if this gamer is already enrolled in another group for the same product
  IF EXISTS (
    SELECT 1
      FROM group_enrollments ge
      JOIN product_groups pg ON pg.id = ge.group_id
     WHERE ge.gamer_id = NEW.gamer_id
       AND pg.product_id = v_product_id
       AND ge.group_id <> NEW.group_id
  ) THEN
    RAISE EXCEPTION 'Gamer is already enrolled in another group for this product'
      USING ERRCODE = '23505'; -- unique_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_unique_gamer_per_product
  BEFORE INSERT ON group_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION check_unique_gamer_per_product();
