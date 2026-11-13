#!/bin/zsh
# 60 s idle at the bottom (one message arriving per second), Instruments Activity Monitor; then idle.py on each trace.
cd "${0:A:h}"
dev=${DEVICE:?set DEVICE to the iPhone UDID}
mkdir -p runs
for r in 1 2; do for a in rn exact; do
  bid=$([[ $a == exact ]] && echo fr.magrin.chatbench || echo com.magrinj.rn)
  name=$([[ $a == exact ]] && echo WhatsApp || echo Chat)
  xcrun xctrace record --template 'Activity Monitor' --device $dev --output runs/idle-$a-$r.trace --time-limit 65s --launch -- $bid
  python3 idle.py runs/idle-$a-$r.trace $name
done; done
