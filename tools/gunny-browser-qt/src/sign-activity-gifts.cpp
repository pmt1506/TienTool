#include "sign-activity-gifts.h"

namespace signactivity {

const char kActivityId[] = "1d3d171f-9517-a3d4-c5da-8d2b169ba44c";

// Quà ngày thứ 1..14, mỗi gói một món.
const GiftBag kDailyGifts[14] = {
    { 1, 1, "e4402570-4d28-9c11-c6d5-5b3246cb22db"},
    { 2, 1, "97421597-95be-ecc5-8c5e-1ec7300c5d1b"},
    { 3, 1, "ff57150e-93ca-b1dc-072c-73131342697f"},
    { 4, 1, "889a2558-665a-2a0e-a0da-5b8c36e6c8a0"},
    { 5, 1, "0c923bc9-bece-05e4-f942-2f0f0f0a4ca9"},
    { 6, 1, "aa5ab8ed-8f15-1dcb-9542-2b0a5139fc4f"},
    { 7, 1, "1c6ef40a-588c-dd47-2adf-d0fa7f779e28"},
    { 8, 1, "5b2701b8-cd8d-d4c5-8a26-09fab50fe52e"},
    { 9, 1, "94c73489-8a99-8c9d-5b7c-455c2fc63e35"},
    {10, 1, "b88fa3d2-3635-e1a4-1a77-706cac0b95e3"},
    {11, 1, "e03285db-25c6-ca41-189a-3fe25fc02689"},
    {12, 1, "3f5be7de-3b32-199a-83a0-02b99a075ad5"},
    {13, 1, "c8a27afe-35d5-efe6-0cf9-1009127121f2"},
    {14, 1, "e6ef5f0d-3fa8-dfa2-f361-dddc485f2f38"},
};

// Quà mốc 3/5/7/9/11/14 ngày liên tiếp, mỗi gói ba món.
const GiftBag kMilestones[6] = {
    { 3, 3, "bd0b94fe-0929-26a1-7494-5431b187b006"},
    { 5, 3, "40de997f-8e32-6faa-0bb4-4813401d6d66"},
    { 7, 3, "8cdbd33b-575e-2871-04eb-f098bdb68ae6"},
    { 9, 3, "45acd0bf-8af8-4beb-a97f-342058edbcc3"},
    {11, 3, "fbf97d70-4176-40fb-a680-ecca10e73276"},
    {14, 3, "b8039368-dcb7-478e-8154-0e63d272ed35"},
};

QString claimCommand(const GiftBag &bag)
{
    return QStringLiteral("a:%1|%2|%3")
        .arg(QLatin1String(kActivityId))
        .arg(QLatin1String(bag.giftbagId))
        .arg(bag.rewards);
}

} // namespace signactivity
