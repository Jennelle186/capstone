import { useMemo } from "react";

import {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxChipsInput,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxItem,
    ComboboxList,
    ComboboxValue,
    useComboboxAnchor,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import type { Option } from "@/types/department";

// The MultiSelectCombobox component is a reusable multiple-selection combobox built on the base-ui Combobox chips pattern. It renders one removable chip per selected option and a filterable popup list, controlled via the value/onValueChange props. Each option value is the underlying department code, while chips and list items display the option label.
interface MultiSelectComboboxProps {
    emptyMessage?: string;
    disabled?: boolean;
    id?: string;
    onValueChange: (values: string[]) => void;
    options: Option[];
    placeholder?: string;
    value: string[];
}

export default function MultiSelectCombobox({
    disabled = false,
    emptyMessage = "No options found.",
    id,
    onValueChange,
    options,
    placeholder = "Search...",
    value,
}: MultiSelectComboboxProps) {
    const anchor = useComboboxAnchor();
    const labelByValue = useMemo(() => {
        const lookup: Record<string, string> = {};
        for (const option of options) {
            lookup[option.value] = option.label;
        }
        return lookup;
    }, [options]);

    const itemValues = useMemo(() => options.map((option) => option.value), [options]);

    return (
        <Combobox
            items={itemValues}
            multiple
            value={value}
            onValueChange={(nextValues) => {
                onValueChange((nextValues ?? []) as string[]);
            }}
        >
            <ComboboxChips
                ref={anchor}
                className={cn(disabled && "pointer-events-none opacity-50")}
            >
                <ComboboxValue>
                    {(selectedValues: string[]) => (
                        <>
                            {selectedValues.map((selectedValue) => (
                                <ComboboxChip key={selectedValue}>
                                    {labelByValue[selectedValue] ?? selectedValue}
                                </ComboboxChip>
                            ))}
                            <ComboboxChipsInput
                                id={id}
                                disabled={disabled}
                                placeholder={selectedValues.length > 0 ? "" : placeholder}
                            />
                        </>
                    )}
                </ComboboxValue>
            </ComboboxChips>
            <ComboboxContent anchor={anchor} portal={false}>
                <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
                <ComboboxList>
                    {(item: string) => (
                        <ComboboxItem key={item} value={item}>
                            {labelByValue[item] ?? item}
                        </ComboboxItem>
                    )}
                </ComboboxList>
            </ComboboxContent>
        </Combobox>
    );
}