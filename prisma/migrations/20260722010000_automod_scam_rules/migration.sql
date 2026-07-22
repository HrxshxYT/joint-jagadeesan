-- Additional native AutoMod keyword rules: scam links, grabbers, nitro/gift
-- scams, crypto scams, and selling/boosting spam.
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeScamLinks" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeGrabbers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeNitroScams" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeCryptoScams" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeAdSpam" BOOLEAN NOT NULL DEFAULT true;
