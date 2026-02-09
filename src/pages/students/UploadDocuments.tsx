import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import UploadZone from "@/components/upload-zone";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

const uploadSchema = z.object({
  files: z
    .array(z.instanceof(File))
    .min(1, "Please upload at least one document")
    .refine(
      (files) => files.every((file) => file.size <= 5 * 1024 * 1024),
      "Each file must be under 5MB"
    ),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

const MotionButton = motion.create(Button);

export default function UploadDocuments() {
  "use no memo";
  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { files: [] },
  });

  const files = useWatch({
    control: form.control,
    name: "files",
    defaultValue: [],
  });

  const handleFilesChange = (nextFiles: File[]) => {
    form.setValue("files", nextFiles, { shouldValidate: true });
  };

  const onSubmit = (values: UploadFormValues) => {
    console.log("Validated form data:", values);
    console.log(
      "Files:",
      values.files.map((file) => ({ name: file.name, type: file.type }))
    );
    console.log("Upload data is ready for the backend.");
    form.reset();
  };

  return (
    <main className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="files"
            render={() => (
              <FormItem>
                <FormControl>
                  <UploadZone files={files} onFilesChange={handleFilesChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2">
            <MotionButton
              type="button"
              variant="outline"
              whileTap={{ scale: 0.98 }}
              onClick={() => form.reset()}
            >
              Cancel
            </MotionButton>
            <MotionButton
              type="submit"
              whileTap={{ scale: 0.98 }}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Upload
            </MotionButton>
          </div>
        </form>
      </Form>
    </main>
  );
}
