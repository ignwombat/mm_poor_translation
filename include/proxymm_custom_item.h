#ifndef PROXYMM_CUSTOM_ITEM_H
#define PROXYMM_CUSTOM_ITEM_H

#include "modding.h"
#include "global.h"

#define CUSTOM_ITEM_FLAGS (actor->home.rot.x)
#define CUSTOM_ITEM_PARAM (actor->home.rot.z)

typedef enum CustomItemFlags {
    // if the player is within range, kill the actor and call the actionFunc
    KILL_ON_TOUCH = 1 << 0,
    // if the player is within range, show the item bobbing above the player 
    // and call the actionFunc
    GIVE_OVERHEAD = 1 << 1,
    // if the player is within range, show the full Get Item Cutscene.
    // WARNING: If you do not call Message_StartTextbox in your actionFunc, 
    // the player will soft lock
    GIVE_ITEM_CUTSCENE = 1 << 2,
    // Usually used in conjunction with KEEP_ON_PLAYER, hides the item until 
    // it is overhead
    HIDE_TILL_OVERHEAD = 1 << 3,
    // Keep the item at the players coordinates until they are ready to pick it up
    KEEP_ON_PLAYER = 1 << 4,
    // Prevent bobbing animation
    STOP_BOBBING = 1 << 5,
    // Prevent spinning animation
    STOP_SPINNING = 1 << 6,
    // Indicates the actionFunc has been called, this can be useful inside the drawFunc
    // as the item can be drawn after the give is fired for the Give Item Cutscenes
    CALLED_ACTION = 1 << 7,
    // Give the item a random initial velocity, similar to how most item drops are spawned
    TOSS_ON_SPAWN = 1 << 8,
    // Allows the item to be picked up by Zora Link's boomerang
    ABLE_TO_ZORA_RANG = 1 << 9,
} CustomItemFlags;

RECOMP_IMPORT("ProxyMM_CustomItem", EnItem00* CustomItem_Spawn(
    PlayState* play,
    // Initial pos & rotation
    f32 posX, f32 posY, f32 posZ, s16 rot, 
    // CustomItemFlags bitfield, can be accessed with CUSTOM_ITEM_FLAGS
    s16 flags,
    // Abitrary s16 to be used for anything. Can be accessed with CUSTOM_ITEM_PARAM
    s16 params,
    // Can be null, called when KILL_ON_TOUCH | GIVE_OVERHEAD | GIVE_ITEM_CUTSCENE
    ActorFunc actionFunc,
    // Can be null, if null it expects a GI_ enum value to be passed in for the params arg
    ActorFunc drawFunc
));

#endif // PROXYMM_CUSTOM_ITEM_H