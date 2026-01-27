export interface ColorPalette {
    name: string
    color: string
    bgColor: string
    headerColor: string
    nodeColor: string
}

export const COLOR_PALETTES: ColorPalette[] = [
    {
        name: 'Coral',
        color: '#FF6B6B',
        bgColor: '#FFE5E5',
        headerColor: '#FF5252',
        nodeColor: '#FF6B6B',
    },
    {
        name: 'Teal',
        color: '#4ECDC4',
        bgColor: '#E0F7F6',
        headerColor: '#1BA8A0',
        nodeColor: '#4ECDC4',
    },
    {
        name: 'Sky',
        color: '#45B7D1',
        bgColor: '#E3F7FF',
        headerColor: '#0D8FB9',
        nodeColor: '#45B7D1',
    },
    {
        name: 'Salmon',
        color: '#FFA07A',
        bgColor: '#FFE8DC',
        headerColor: '#FF7F50',
        nodeColor: '#FFA07A',
    },
    {
        name: 'Mint',
        color: '#98D8C8',
        bgColor: '#E8F8F3',
        headerColor: '#52B8A0',
        nodeColor: '#98D8C8',
    },
    {
        name: 'Gold',
        color: '#F7DC6F',
        bgColor: '#FFFACD',
        headerColor: '#F4C430',
        nodeColor: '#F7DC6F',
    },
    {
        name: 'Purple',
        color: '#BB8FCE',
        bgColor: '#F5E6FA',
        headerColor: '#9B59B6',
        nodeColor: '#BB8FCE',
    },
    {
        name: 'Blue',
        color: '#85C1E9',
        bgColor: '#E8F4FB',
        headerColor: '#3498DB',
        nodeColor: '#85C1E9',
    },
    {
        name: 'Orange',
        color: '#F8B88B',
        bgColor: '#FFF0E6',
        headerColor: '#E67E22',
        nodeColor: '#F8B88B',
    },
    {
        name: 'Green',
        color: '#A3E4D7',
        bgColor: '#E8FFF7',
        headerColor: '#27AE60',
        nodeColor: '#A3E4D7',
    },
    {
        name: 'Rose',
        color: '#D7BCCB',
        bgColor: '#FBF2F7',
        headerColor: '#C2185B',
        nodeColor: '#D7BCCB',
    },
    {
        name: 'Cyan',
        color: '#B4E7FF',
        bgColor: '#E0F7FF',
        headerColor: '#0084FF',
        nodeColor: '#B4E7FF',
    },
    {
        name: 'Peach',
        color: '#FFD4A3',
        bgColor: '#FFF5EB',
        headerColor: '#FF8C42',
        nodeColor: '#FFD4A3',
    },
    {
        name: 'Lime',
        color: '#C8E6A0',
        bgColor: '#F8FFF0',
        headerColor: '#8BC34A',
        nodeColor: '#C8E6A0',
    },
    {
        name: 'Pink',
        color: '#F4A6D3',
        bgColor: '#FFF0F8',
        headerColor: '#E91E63',
        nodeColor: '#F4A6D3',
    },
]

export const getColorPalette = (index: number): ColorPalette => {
    return COLOR_PALETTES[index % COLOR_PALETTES.length]
}
