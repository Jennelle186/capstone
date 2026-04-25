import { motion } from "framer-motion";
import type { ReactNode } from "react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { fadeInUp } from "@/components/admin/motion-variants";

interface PageHeaderProps {
    title: string;
    subtitle: string;
    actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <motion.div variants={fadeInUp}>
            <AdminPageHeader title={title} description={subtitle} actions={actions} />
        </motion.div>
    );
}
