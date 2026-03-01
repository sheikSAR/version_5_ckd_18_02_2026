import pickletools

with open(r'e:\ckd\Version_4_CKD\version4_ckd\backend\models\classifier2\2802CKD_Clinical_Cols.pkl', 'rb') as f:
    strings = []
    for opcode, arg, pos in pickletools.genops(f):
        if 'UNICODE' in opcode.name or 'STRING' in opcode.name:
            strings.append(arg)
            
with open(r'e:\ckd\Version_4_CKD\version4_ckd\features.txt', 'w') as out:
    for s in strings:
        out.write(s + '\n')
