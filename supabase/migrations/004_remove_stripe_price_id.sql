-- stripe_price_idカラムを削除（stripe_price_ids JSONBのみを使用）
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行
-- 
-- 注意: このマイグレーションは既に003_add_multi_currency_support.sqlを実行した後に実行してください
-- カラムが存在しない場合は何も実行されません（安全）

-- plansテーブルからstripe_price_idカラムを削除（存在する場合のみ）
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'plans' 
    AND column_name = 'stripe_price_id'
  ) THEN
    ALTER TABLE plans DROP COLUMN stripe_price_id;
  END IF;
END $$;

