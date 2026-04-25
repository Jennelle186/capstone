import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { fadeInUp } from "@/components/admin/motion-variants";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
    title: string;
    description: string;
    icon?: ReactNode;
    action?: ReactNode;
}

export default function EmptyState({ title, description, icon, action }: EmptyStateProps) {
    return (
        <motion.div variants={fadeInUp}>
            <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                    {icon ? <div className="text-muted-foreground">{icon}</div> : null}
                    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                    <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
                    {action ? <div className="mt-2">{action}</div> : null}
                </CardContent>
            </Card>
        </motion.div>
    );
}
